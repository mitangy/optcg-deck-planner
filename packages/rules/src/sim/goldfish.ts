/**
 * Goldfish runs (#402): a scripted pilot plays a deck through the real engine against a dummy that never
 * plays, attaches, attacks, blocks or counters. Answers "how fast can this deck win", "does it curve out"
 * and "when does card X come down", not "how often does it beat a real opponent".
 *
 * Everything is deterministic: a seed decides the shuffle, the pilot is a script, and every intent goes
 * through `applyIntent`, so the engine validates each move.
 *
 * Usage: npx tsx src/sim/goldfish.ts [runs]
 */
import { abilityById } from "../cards/abilities.js";
import { getCardDef, hasCardDef } from "../cards/definitions.js";
import { abilitySupportForCard, type AbilitySupport } from "../cards/effectCatalog.js";
import { applyIntent, createMatch, hasKeyword, listLegalIntents, playCostOf, powerOf } from "../engine.js";
import { addModifier } from "../engine/modifiers.js";
import { activeDon } from "../engine/state.js";
import { createSeededRng, type Rng } from "../rng.js";
import type { GameEvent, Intent, MatchState, PendingChoice, PlayerState } from "../types.js";
import { actingSeat, randomDeck } from "./fuzz.js";

export const GOLDFISH_DUMMY_LEADER = "ST01-001";
export const GOLDFISH_DUMMY_CARD = "OP01-023";
const DUMMY_DECK: string[] = Array(50).fill(GOLDFISH_DUMMY_CARD);

export type GoldfishLine = "auto" | "develop" | "aggro";

export interface GoldfishSetup {
  leaderId: string;
  /** 50 expanded ids. */
  deck: string[];
  goingFirst: boolean;
  /** Play through your turn `turns` (1-10). */
  turns: number;
  /** 0-8. */
  opponentLife: number;
  /** 1000-15000. */
  opponentPower: number;
  mulligan: "auto" | "never";
  keepCards: string[];
  line: GoldfishLine;
  track: string[];
  supportOf?: (id: string) => AbilitySupport;
  /** Intent cap per run (default 1500); a run that reaches it ends with the error "stuck". */
  maxIntents?: number;
}

export interface GoldfishTurn {
  turn: number;
  line: "develop" | "aggro";
  /** Active DON!! at the start of the main phase. */
  don: number;
  /** Sum of `costPaid` over cards played. */
  spent: number;
  played: string[];
  donGiven: number;
  attacks: number;
  /** Life cards the dummy lost. */
  hits: number;
  characters: number;
  opponentLife: number;
}

export interface GoldfishRun {
  seed: number;
  mulliganed: boolean;
  /** The kept opening hand. */
  openingHand: string[];
  winTurn: number | null;
  turns: GoldfishTurn[];
  firstPlayed: Record<string, number>;
  touchedFlagged: boolean;
  pilotLifeLost: number;
  /** Intents applied, including the lookahead the pilot threw away. */
  intents: number;
  error?: string;
}

export interface GoldfishSummary {
  runs: number;
  wins: number;
  byTurn: { turn: number; wins: number; percent: number; interval: [number, number] }[];
  fastestWinTurn: number | null;
  medianWinTurn: number | null;
  mulligans: number;
  keepCardRuns: number | null;
  curve: { turn: number; runs: number; avgDon: number; avgSpent: number; allDonUsedPercent: number; avgCharacters: number; avgOpponentLife: number }[];
  cards: { id: string; byTurn: { turn: number; percent: number }[] }[];
  flagged: { id: string; support: AbilitySupport }[];
  runsAffected: number;
  errors: number;
  firstError: string | null;
  example: GoldfishRun | null;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export interface DeployCandidate { idx: number; cost: number; power: number }
interface Subset { count: number; power: number; idx: number[] }

function lexLess(a: number[], b: number[]): boolean {
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) if (a[i] !== b[i]) return a[i]! < b[i]!;
  return a.length < b.length;
}

function better(a: Subset, b: Subset | undefined): boolean {
  return !b || a.count > b.count || (a.count === b.count && (a.power > b.power || (a.power === b.power && lexLess(a.idx, b.idx))));   // better()
}

/**
 * The hand cards to play with `don` active DON!!: the subset that spends the most DON!! (0/1 knapsack).
 * Ties go to more cards, then more power, then earlier hand slots.
 */
export function bestDeploy(cands: DeployCandidate[], don: number): DeployCandidate[] {
  const best: (Subset | undefined)[] = Array(Math.max(0, don) + 1).fill(undefined);
  best[0] = { count: 0, power: 0, idx: [] };
  const ordered = [...cands].sort((a, b) => a.idx - b.idx);
  for (const c of ordered) {
    for (let s = Math.max(0, don); s >= c.cost; s -= 1) {
      const from = best[s - c.cost];
      if (!from) continue;
      const next: Subset = { count: from.count + 1, power: from.power + c.power, idx: [...from.idx, c.idx] };
      if (better(next, best[s])) best[s] = next;
    }
  }
  for (let s = best.length - 1; s > 0; s -= 1) {
    const hit = best[s];
    if (hit) return hit.idx.map((i) => ordered.find((c) => c.idx === i)!);
  }
  return [];
}

/** Whether the pilot sends this opening hand back. */
export function shouldMulligan(hand: string[], rule: { mulligan: "auto" | "never"; keepCards: string[] }): boolean {
  if (rule.mulligan === "never") return false;
  if (rule.keepCards.length) return !hand.some((id) => rule.keepCards.includes(id));
  return !hand.some((id) => { const d = getCardDef(id); return d.type === "character" && d.cost <= 3; });
}

/** 95% Wilson score interval for k of n, in percent with one decimal. */
export function wilsonPercent(k: number, n: number): [number, number] {
  if (n <= 0) return [0, 0];
  const z = 1.96;
  const z2 = z * z;
  const p = k / n;
  const center = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  const pct = (x: number) => Math.round(Math.min(100, Math.max(0, x * 100)) * 10) / 10;
  return [pct(center - half), pct(center + half)];
}

const FLAGGED_SUPPORT = new Set<AbilitySupport>(["partial", "unsupported", "unverified"]);

/** Cards in the leader plus the deck the engine doesn't fully support, one row per distinct id. */
export function flaggedCards(setup: Pick<GoldfishSetup, "leaderId" | "deck" | "supportOf">): { id: string; support: AbilitySupport }[] {
  const supportOf = setup.supportOf ?? abilitySupportForCard;
  return [...new Set([setup.leaderId, ...setup.deck])]
    .sort()
    .flatMap((id) => {
      const support = supportOf(id);
      return FLAGGED_SUPPORT.has(support) ? [{ id, support }] : [];
    });
}

/** Trims or fills the dummy's Life to `n` by moving cards between its Life and its deck. */
export function setDummyLife(state: MatchState, n: number): void {
  const p = state.players[1];
  while (p.life.length > n) {
    p.deck.push(p.life.pop()!);
    p.zoneInstanceIds.deck.push(p.zoneInstanceIds.life.pop()!);
    p.faceUpLife.pop();
  }
  while (p.life.length < n && p.deck.length) {
    p.life.push(p.deck.shift()!);
    p.zoneInstanceIds.life.push(p.zoneInstanceIds.deck.shift()!);
    p.faceUpLife.push(false);
  }
}

// ---------------------------------------------------------------------------
// Engine plumbing
// ---------------------------------------------------------------------------

class GoldfishError extends Error {}

interface Ctx { intents: number; max: number; turns: number; rng: Rng }
/** A state and the events that led to it; a turn plays on its own cursor so lookahead can be thrown away. */
interface Cursor { state: MatchState; events: GameEvent[] }

function apply(cur: Cursor, ctx: Ctx, intent: Intent, seat: 0 | 1): boolean {
  ctx.intents += 1;
  if (ctx.intents > ctx.max) throw new GoldfishError("stuck");
  const r = applyIntent(cur.state, intent, { seat, rng: ctx.rng });
  if (!r.ok) return false;
  cur.state = r.state;
  cur.events.push(...r.events);
  return true;
}

const isAnswer = (i: Intent): i is Extract<Intent, { type: "resolve_pending_choice" }> => i.type === "resolve_pending_choice";

/** The dummy takes the first thing that ends its turn or passes a defense, and declines every optional choice. */
function dummyIntent(legal: Intent[], front: PendingChoice | undefined): Intent {
  if (front) return legal.find((i) => isAnswer(i) && !i.accept) ?? legal[0]!;
  return legal.find((i) => i.type === "pass_block" || i.type === "pass_counter" || i.type === "end_turn") ?? legal[0]!;   // dummyIntent, no pending choice
}

const HARMFUL_PURPOSE = /K\.O\.|trash|^rest|return|place at the (top|bottom) of the deck|^-|−/i;

const costOfId = (defId: string | undefined): number => (defId && hasCardDef(defId) ? getCardDef(defId).cost : 0);

function readyToAttack(p: PlayerState, state: MatchState, c: PlayerState["leader"]): boolean {
  if (c.rested) return false;
  if (c.id === p.leader.id) return p.turnsStarted >= 2;
  return !c.summoningSick || hasKeyword(state, 0, c, "rush");
}

/** How much the pilot wants this one of its own cards picked by a beneficial effect; harmful picks go the other way. */
function goodness(state: MatchState, o: { defId?: string; instanceId?: string }): number {
  const p = state.players[0];
  const field = o.instanceId ? [p.leader, ...p.characters, ...(p.stage ? [p.stage] : [])].find((c) => c.id === o.instanceId) : undefined;
  if (field) return (readyToAttack(p, state, field) ? 1e7 : 0) + (field.id === p.leader.id ? 1e6 : 0) + powerOf(state, 0, field);
  return costOfId(o.defId);
}

/** The pilot's answer to the front pending choice (seat 0). */
function pilotAnswer(state: MatchState, choice: PendingChoice, legal: Intent[]): Intent {
  const accept = () => legal.find((i) => isAnswer(i) && i.accept) ?? legal[0]!;
  if (choice.kind === "order_effects" || choice.unpayable) return legal[0]!;
  if (choice.kind === "life_trigger") return accept();
  const r = choice.request;
  if (!r || r.type === "confirm") return accept();
  switch (r.type) {
    case "mode":
    case "order":
      return legal[0]!;
    case "select": {
      if (r.max === 0) return { type: "resolve_pending_choice", accept: true, selectedOptionIds: [] };
      const eligible = r.options.filter((o) => o.eligible);
      const own = eligible.length > 0 && eligible.every((o) => o.ownerSeat === 0);
      const cut = choice.prompt.lastIndexOf(" to ");
      const harmful = own && HARMFUL_PURPOSE.test(cut >= 0 ? choice.prompt.slice(cut + 4) : "");
      const want = r.min === r.max ? r.min : harmful ? r.min : r.max;
      const ordered = own ? eligible.map((o, i) => ({ o, i, g: goodness(state, o) })).sort((a, b) => (harmful ? a.g - b.g : b.g - a.g) || a.i - b.i).map((x) => x.o) : eligible;
      const picked: string[] = [];
      const names = new Set<string>();
      for (const o of ordered) {
        if (picked.length >= want) break;
        const name = r.distinctNames && o.defId && hasCardDef(o.defId) ? getCardDef(o.defId).name : null;
        if (name !== null) {
          if (names.has(name)) continue;
          names.add(name);
        }
        picked.push(o.id);
      }
      return { type: "resolve_pending_choice", accept: true, selectedOptionIds: picked };
    }
    case "look": {
      const capacity = r.groups.map((g) => g.max);
      const picked: string[] = [];
      for (const o of r.options.map((x, i) => ({ x, i })).sort((a, b) => costOfId(b.x.defId) - costOfId(a.x.defId) || a.i - b.i).map((e) => e.x)) {
        if (picked.length >= r.maxSelect) break;
        const g = r.groups.findIndex((grp, gi) => capacity[gi]! > 0 && grp.eligibleIds.includes(o.id));
        if (g >= 0) {
          capacity[g]! -= 1;
          picked.push(o.id);
        }
      }
      const rest = r.options.map((o) => o.id).filter((id) => !picked.includes(id));
      return { type: "resolve_pending_choice", accept: true, selectedOptionIds: picked, orderedOptionIds: rest, ...(r.rest === "top_or_bottom" ? { topOptionIds: [] } : {}) };
    }
  }
}

/** Answers prompts and plays the dummy's turns until seat 0 is idle in its own main phase or the game is over. */
function settle(cur: Cursor, ctx: Ctx): void {
  for (;;) {
    const s = cur.state;
    if (s.winner !== null) return;
    const seat = actingSeat(s);
    const legal = listLegalIntents(s, seat);
    const front = s.pendingChoices[0];
    if (legal.length === 0) throw new GoldfishError(`no legal intents in phase ${s.phase} for seat ${seat}`);
    if (seat === 1) {
      if (!apply(cur, ctx, dummyIntent(legal, front), 1) && !apply(cur, ctx, legal[0]!, 1)) throw new GoldfishError("the dummy's move was rejected");
      continue;
    }
    if (front) {
      if (!apply(cur, ctx, pilotAnswer(s, front, legal), 0) && !apply(cur, ctx, legal[0]!, 0)) throw new GoldfishError(`a choice was rejected: ${front.prompt}`);
      continue;
    }
    if (s.phase === "block" || s.phase === "counter") {
      const pass = legal.find((i) => i.type === "pass_block" || i.type === "pass_counter") ?? legal[0]!;
      if (!apply(cur, ctx, pass, 0)) throw new GoldfishError("a defense was rejected");
      continue;
    }
    if (s.phase === "main") return;
    throw new GoldfishError(`the pilot has nothing to do in phase ${s.phase}`);
  }
}

// ---------------------------------------------------------------------------
// The pilot's turn
// ---------------------------------------------------------------------------

const SELF_COSTS = new Set(["rest_self", "trash_self", "self_to_hand", "self_to_deck_bottom"]);
const MAX_ACTIVATIONS = 10;

const donCount = (s: MatchState) => activeDon(s.players[0]).length;
const leaderAttacks = (legal: Intent[]) => legal.filter((i): i is Extract<Intent, { type: "declare_attack" }> => i.type === "declare_attack" && i.target.kind === "leader");

function deploy(cur: Cursor, ctx: Ctx): void {
  const rejected = new Set<string>();
  for (;;) {
    const s = cur.state;
    if (s.winner !== null) return;
    const p = s.players[0];
    const don = donCount(s);
    const plain = new Set(listLegalIntents(s, 0).flatMap((i) => (i.type === "play_card" && !i.trashCharacterId ? [i.handIndex] : [])));
    const cands: DeployCandidate[] = [];
    p.hand.forEach((c, idx) => {
      if (rejected.has(c.id) || !plain.has(idx)) return;
      const d = getCardDef(c.defId);
      if (d.type === "character" ? p.characters.length >= 5 : d.type === "stage" ? p.stage !== null : true) return;
      const cost = playCostOf(s, 0, c);
      if (cost <= don) cands.push({ idx, cost, power: d.power ?? 0 });
    });
    const pick = bestDeploy(cands, don).sort((a, b) => b.cost - a.cost || a.idx - b.idx)[0];
    if (!pick) return;
    if (!apply(cur, ctx, { type: "play_card", handIndex: pick.idx }, 0)) {
      rejected.add(p.hand[pick.idx]!.id);
      continue;
    }
    settle(cur, ctx);
  }
}

function activate(cur: Cursor, ctx: Ctx, phase: "pre" | "post", tried: Set<string>): void {
  for (;;) {
    const s = cur.state;
    if (s.winner !== null || tried.size >= MAX_ACTIVATIONS) return;
    const legal = listLegalIntents(s, 0);
    const canAttack = new Set(legal.flatMap((i) => (i.type === "declare_attack" ? [i.attackerId] : [])));
    const pick = legal.find((i) => {
      if (i.type !== "activate_ability" || tried.has(`${i.sourceId}|${i.abilityId}`)) return false;
      const spendsSelf = abilityById(i.abilityId)?.ability.costs?.some((c) => SELF_COSTS.has(c.k)) ?? false;
      return !(phase === "pre" && spendsSelf && canAttack.has(i.sourceId));
    });
    if (!pick || pick.type !== "activate_ability") return;
    tried.add(`${pick.sourceId}|${pick.abilityId}`);
    if (apply(cur, ctx, pick, 0)) settle(cur, ctx);
  }
}

function fundAttackers(cur: Cursor, ctx: Ctx): void {
  const s = cur.state;
  const p = s.players[0];
  const can = new Set(leaderAttacks(listLegalIntents(s, 0)).map((i) => i.attackerId));
  const target = powerOf(s, 1, s.players[1].leader);
  const order = [p.leader, ...p.characters]
    .filter((c) => can.has(c.id))
    .map((c) => ({ id: c.id, leader: c.id === p.leader.id, double: hasKeyword(s, 0, c, "double_attack"), need: Math.max(0, Math.ceil((target - powerOf(s, 0, c)) / 1000)) }))
    .sort((a, b) => a.need - b.need || Number(b.double) - Number(a.double) || Number(b.leader) - Number(a.leader) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const a of order) {            // fundAttackers loop
    if (donCount(cur.state) < a.need) break;
    for (let i = 0; i < a.need; i += 1) {
      const don = activeDon(cur.state.players[0])[0]!;
      if (!apply(cur, ctx, { type: "give_don", donId: don.id, targetId: a.id }, 0)) return;
    }
  }
}

function playEvents(cur: Cursor, ctx: Ctx): void {
  const done = new Set<string>();
  for (;;) {
    const s = cur.state;
    if (s.winner !== null) return;
    const p = s.players[0];
    const don = donCount(s);
    const plays = listLegalIntents(s, 0)
      .flatMap((i) => (i.type === "play_card" ? [{ i, c: p.hand[i.handIndex]! }] : []))
      .filter(({ c }) => !done.has(c.id) && getCardDef(c.defId).type === "event" && playCostOf(s, 0, c) <= don)
      .sort((a, b) => playCostOf(s, 0, a.c) - playCostOf(s, 0, b.c) || (a.i.type === "play_card" && b.i.type === "play_card" ? a.i.handIndex - b.i.handIndex : 0));
    const pick = plays[0];
    if (!pick) return;
    done.add(pick.c.id);
    if (apply(cur, ctx, pick.i, 0)) settle(cur, ctx);
  }
}

function leftoverToLeader(cur: Cursor, ctx: Ctx): void {
  const leader = cur.state.players[0].leader;
  if (!leaderAttacks(listLegalIntents(cur.state, 0)).some((i) => i.attackerId === leader.id)) return;
  while (donCount(cur.state) > 0) {
    const don = activeDon(cur.state.players[0])[0]!;
    if (!apply(cur, ctx, { type: "give_don", donId: don.id, targetId: leader.id }, 0)) return;
  }
}

function attackAll(cur: Cursor, ctx: Ctx): void {
  for (;;) {
    const s = cur.state;
    if (s.winner !== null) return;
    const attacks = leaderAttacks(listLegalIntents(s, 0));
    if (!attacks.length) return;
    const p = s.players[0];
    const rank = (id: string) => (id === p.leader.id ? Infinity : powerOf(s, 0, p.characters.find((c) => c.id === id)!));
    const pick = [...attacks].sort((a, b) => rank(b.attackerId) - rank(a.attackerId) || (a.attackerId < b.attackerId ? -1 : 1))[0]!;
    if (!apply(cur, ctx, pick, 0)) return;
    settle(cur, ctx);
  }
}

function turnRecord(events: GameEvent[], before: MatchState, after: MatchState): Omit<GoldfishTurn, "line"> {
  const mine = events.filter((e) => "seat" in e && e.seat === 0);
  const played = mine.flatMap((e) => (e.type === "card_played" ? [e] : []));
  return {
    turn: before.players[0].turnsStarted,
    don: donCount(before),
    spent: played.reduce((n, e) => n + e.costPaid, 0),
    played: played.map((e) => e.defId),
    donGiven: mine.filter((e) => e.type === "don_given").length,
    attacks: mine.filter((e) => e.type === "attack_declared").length,
    hits: events.filter((e) => e.type === "life_taken" && e.seat === 1).length,
    characters: after.players[0].characters.length,
    opponentLife: after.players[1].life.length,
  };
}

interface TurnResult { state: MatchState; events: GameEvent[]; line: "develop" | "aggro"; record: GoldfishTurn }

/** Plays seat 0's turn in one line and (unless the game or the run is over) hands the dummy its turn. */
function playTurn(state: MatchState, line: "develop" | "aggro", ctx: Ctx): TurnResult {
  const cur: Cursor = { state, events: [] };
  const tried = new Set<string>();
  if (line === "develop") {
    deploy(cur, ctx);
    activate(cur, ctx, "pre", tried);
    fundAttackers(cur, ctx);
    playEvents(cur, ctx);
    leftoverToLeader(cur, ctx);
    attackAll(cur, ctx);
    activate(cur, ctx, "post", tried);
  } else {
    fundAttackers(cur, ctx);
    attackAll(cur, ctx);
    deploy(cur, ctx);
    activate(cur, ctx, "pre", tried);
    activate(cur, ctx, "post", tried);
    playEvents(cur, ctx);
  }
  const record = { ...turnRecord(cur.events, state, cur.state), line };
  if (cur.state.winner === null && state.players[0].turnsStarted < ctx.turns) {
    if (!apply(cur, ctx, { type: "end_turn" }, 0)) throw new GoldfishError("end_turn was rejected");
    settle(cur, ctx);
  }
  return { state: cur.state, events: cur.events, line, record };
}

/** Develop first; when that doesn't win, try going face from the same state (states are immutable) and keep it only if it wins. */
function chooseTurn(state: MatchState, line: GoldfishLine, ctx: Ctx): TurnResult {
  if (line === "aggro") return playTurn(state, "aggro", ctx);
  const develop = playTurn(state, "develop", ctx);
  if (line === "develop" || develop.state.winner === 0 || state.players[0].turnsStarted < 2) return develop;
  const aggro = playTurn(state, "aggro", ctx);
  return aggro.state.winner === 0 ? aggro : develop;
}

// ---------------------------------------------------------------------------
// One game
// ---------------------------------------------------------------------------

export function goldfishRun(setup: GoldfishSetup, seed: number): GoldfishRun {
  const run: GoldfishRun = { seed, mulliganed: false, openingHand: [], winTurn: null, turns: [], firstPlayed: {}, touchedFlagged: false, pilotLifeLost: 0, intents: 0 };
  const flaggedIds = new Set(flaggedCards(setup).map((f) => f.id));
  const leaderFlagged = flaggedIds.has(setup.leaderId);
  let touched = false;
  const ctx: Ctx = { intents: 0, max: setup.maxIntents ?? 1500, turns: setup.turns, rng: createSeededRng(0) };
  const scan = (events: GameEvent[], turn: number) => {
    for (const e of events) {
      if (e.type === "life_taken" && e.seat === 0) run.pilotLifeLost += 1;
      if (e.type === "card_played" && e.seat === 0) {
        if (!(e.defId in run.firstPlayed)) run.firstPlayed[e.defId] = turn;
        if (flaggedIds.has(e.defId)) touched = true;
      }
      if (e.type === "ability_activated" && e.seat === 0 && flaggedIds.has(e.defId)) touched = true;
    }
  };
  try {
    let state = createMatch({ seed, firstSeat: setup.goingFirst ? 0 : 1, players: [{ leaderId: setup.leaderId, deck: setup.deck }, { leaderId: GOLDFISH_DUMMY_LEADER, deck: DUMMY_DECK }] });
    const cur: Cursor = { state, events: [] };
    while (cur.state.phase === "mulligan") {
      state = cur.state;
      const seat = actingSeat(state);
      const legal = listLegalIntents(state, seat);
      const front = state.pendingChoices[0];
      let intent: Intent;
      if (front) intent = seat === 0 ? pilotAnswer(state, front, legal) : dummyIntent(legal, front);
      else if (seat === 0) {
        const hand = state.players[0].hand.map((c) => c.defId);
        run.mulliganed = shouldMulligan(hand, setup);
        intent = { type: "mulligan", doMulligan: run.mulliganed };
      } else intent = { type: "mulligan", doMulligan: false };
      if (!apply(cur, ctx, intent, seat) && !apply(cur, ctx, legal[0]!, seat)) throw new GoldfishError(`the opening was rejected in phase ${state.phase}`);
      if (!front && seat === 0) run.openingHand = cur.state.players[0].hand.map((c) => c.defId);
    }
    state = cur.state;
    setDummyLife(state, setup.opponentLife);
    addModifier(state, 1, undefined, { kind: "card", id: state.players[1].leader.id }, { type: "base_power", value: setup.opponentPower }, { kind: "permanent" });
    scan(cur.events, 1);
    cur.events = [];
    settle(cur, ctx);
    scan(cur.events, 1);
    state = cur.state;
    while (state.winner === null && state.players[0].turnsStarted <= setup.turns) {
      const t = chooseTurn(state, setup.line, ctx);
      run.turns.push(t.record);
      scan(t.events, t.record.turn);
      state = t.state;
      if (state.winner === 0) run.winTurn = t.record.turn;
      if (t.record.turn >= setup.turns) break;
    }
  } catch (e) {
    run.error = e instanceof Error ? e.message : String(e);
  }
  run.touchedFlagged = leaderFlagged || touched;
  run.intents = ctx.intents;
  return run;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function summarizeGoldfish(setup: GoldfishSetup, runs: GoldfishRun[]): GoldfishSummary {
  const n = runs.length;
  const wins = runs.filter((r) => r.winTurn !== null);
  const winTurns = wins.map((r) => r.winTurn!).sort((a, b) => a - b);
  const turns = Array.from({ length: setup.turns }, (_, i) => i + 1);
  const share = (k: number) => (n ? round((k / n) * 100) : 0);
  const example = wins.reduce<GoldfishRun | null>((best, r) => (!best || r.winTurn! < best.winTurn! ? r : best), null);
  const errored = runs.filter((r) => r.error);
  return {
    runs: n,
    wins: wins.length,
    byTurn: turns.map((turn) => {
      const k = wins.filter((r) => r.winTurn! <= turn).length;
      return { turn, wins: k, percent: share(k), interval: wilsonPercent(k, n) };
    }),
    fastestWinTurn: winTurns[0] ?? null,
    medianWinTurn: winTurns.length ? winTurns[Math.floor((winTurns.length - 1) / 2)]! : null,
    mulligans: runs.filter((r) => r.mulliganed).length,
    keepCardRuns: setup.keepCards.length ? runs.filter((r) => r.openingHand.some((id) => setup.keepCards.includes(id))).length : null,
    curve: turns.map((turn) => {
      const rows = runs.flatMap((r) => (r.turns[turn - 1] ? [r.turns[turn - 1]!] : []));
      return {
        turn,
        runs: rows.length,
        avgDon: round(mean(rows.map((t) => t.don))),
        avgSpent: round(mean(rows.map((t) => t.spent))),
        allDonUsedPercent: rows.length ? round((rows.filter((t) => t.spent >= t.don).length / rows.length) * 100) : 0,
        avgCharacters: round(mean(rows.map((t) => t.characters))),
        avgOpponentLife: round(mean(rows.map((t) => t.opponentLife))),
      };
    }),
    cards: setup.track.map((id) => ({
      id,
      byTurn: turns.map((turn) => ({ turn, percent: share(runs.filter((r) => (r.firstPlayed[id] ?? Infinity) <= turn).length) })),
    })),
    flagged: flaggedCards(setup),
    runsAffected: runs.filter((r) => r.touchedFlagged).length,
    errors: errored.length,
    firstError: errored[0]?.error ?? null,
    example,
  };
}

// ---------------------------------------------------------------------------
// Bench: npx tsx src/sim/goldfish.ts [runs]
// ---------------------------------------------------------------------------

if (process.argv[1] && /goldfish\.ts$/.test(process.argv[1])) {
  const n = Number(process.argv[2] ?? 100);
  const { leaderId, deck } = randomDeck(createSeededRng(3), undefined, "ST01-001");
  const setup: GoldfishSetup = { leaderId, deck, goingFirst: true, turns: 6, opponentLife: 4, opponentPower: 5000, mulligan: "auto", keepCards: [], line: "auto", track: [] };
  const started = Date.now();
  let intents = 0;
  let errors = 0;
  for (let i = 0; i < n; i += 1) {
    const run = goldfishRun(setup, (1 + i * 0x9e3779b1) >>> 0);
    intents += run.intents;
    if (run.error) { errors += 1; if (errors <= 3) console.log(`seed ${run.seed}: ${run.error}`); }
  }
  const ms = Date.now() - started;
  console.log(`goldfish: ${n} runs, ${(ms / Math.max(1, n)).toFixed(1)} ms/run, ${(intents / Math.max(1, n)).toFixed(0)} intents/run`);
  if (errors) console.log(`goldfish: ${errors} runs ended on an error`);
}
