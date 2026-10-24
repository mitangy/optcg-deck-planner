/**
 * Where puzzle positions come from (#677): mid-game states sampled from bot self-play games (fixed seeds), and boards
 * built card by card with the rules Harness. Both are deterministic for a seed. A state is a position only when the
 * question can be answered from what the text shows: it is somebody's idle Main Phase, no choice is pending, and no
 * temporary effect or this-turn record the text could not show is in play.
 */
import { createSeededRng, listCardDefs, replayApply, replayStart, type MatchReplay, type MatchState, type Rng, type Seat } from "@optcg/rules";
import { playBotGame } from "@optcg/rules/src/sim/selfPlay";
import { randomDeck } from "@optcg/rules/src/sim/fuzz";
import { FILLER, Harness } from "@optcg/rules/src/testing/harness";
import type { Catalog } from "../../src/catalog";
import { NEW_SET } from "./types";

export type DeckSource = { name?: string; leaderId: string; deck: string[] };
export type Position = { id: string; state: MatchState; source: string; synthetic: boolean };

/** The active seat is in its Main Phase with nothing waiting: the state a player sees at the start of a decision. */
export function isIdleMain(state: MatchState): boolean {
  return state.winner === null && state.phase === "main" && !state.battle && !state.pendingChoices.length && !state.resolutionFrames.length && !state.triggerQueue.length && !state.steps.length;
}

/** Markers ("flag") only: no buff, keyword, restriction or cost change is in play that the position text would have to mention. */
export function plainState(state: MatchState): boolean {
  if (state.modifiers.some((m) => m.effect.type !== "flag")) return false;
  return state.players.every((p) => !p.turnLog || p.turnLog.turn !== state.turnNumber || (!p.turnLog.events.length && !p.turnLog.koed.length && !p.turnLog.handTrashed));
}

export function samplableState(state: MatchState): boolean {
  return isIdleMain(state) && plainState(state) && state.turnNumber >= 2;
}

/** Up to `perGame` distinct states of a replay that are positions, at most one per turn. */
export function samplePositions(replay: MatchReplay, rng: Rng, perGame: number, label: string): Position[] {
  const candidates: { i: number; turn: number }[] = [];
  let state = replayStart(replay);
  replay.intents.forEach((_, i) => {
    state = replayApply(state, replay, i).state;
    if (samplableState(state)) candidates.push({ i, turn: state.turnNumber });
  });
  const picked: { i: number; turn: number }[] = [];
  const turns = new Set<number>();
  for (const c of rng.shuffle([...candidates])) {
    if (picked.length >= perGame) break;
    if (turns.has(c.turn)) continue;
    turns.add(c.turn);
    picked.push(c);
  }
  picked.sort((a, b) => a.i - b.i);
  const want = new Set(picked.map((c) => c.i));
  const out: Position[] = [];
  state = replayStart(replay);
  replay.intents.forEach((_, i) => {
    state = replayApply(state, replay, i).state;
    if (want.has(i)) out.push({ id: `${label}-i${i}`, state, source: `selfplay seed ${replay.seed} intent ${i}`, synthetic: false });
  });
  return out;
}

type Def = ReturnType<typeof listCardDefs>[number];
const usable = (d: Def) => d.dataSource !== "stub";
const leaderDefs = () => listCardDefs().filter((d) => usable(d) && d.type === "leader" && d.life != null);

/** A deck built around cards of the newest sets: a new Leader (or any Leader) with four copies each of a few new cards of its colors. */
export function newSetDeck(rng: Rng, catalog: Catalog): DeckSource {
  const leaders = leaderDefs();
  const newLeaders = leaders.filter((d) => NEW_SET.test(d.id));
  const leader = rng.next() < 0.6 && newLeaders.length ? newLeaders[rng.nextInt(newLeaders.length)]! : leaders[rng.nextInt(leaders.length)]!;
  const pool = listCardDefs().filter((d) => usable(d) && d.type !== "leader" && NEW_SET.test(d.id) && d.colors.some((c) => leader.colors.includes(c)) && ["supported", "vanilla"].includes(catalog.cards.get(d.id)?.support ?? ""));
  const focus = rng.shuffle([...pool]).slice(0, 4).map((d) => d.id);
  return randomDeck(rng, focus, leader.id);
}

/**
 * Self-play games with fixed seeds, `perGame` positions from each. A game uses new-set decks with probability `newShare`
 * (both decks), otherwise the meta decks or random decks.
 */
export function selfPlayPositions(opts: { seed: number; games: number; perGame: number; newShare: number; decks?: DeckSource[]; catalog: Catalog }): Position[] {
  const out: Position[] = [];
  for (let g = 0; g < opts.games; g += 1) {
    const gameSeed = opts.seed * 100000 + g + 1;
    const rng = createSeededRng(gameSeed);
    const fresh = rng.next() < opts.newShare;
    const pick = (): DeckSource => (fresh ? newSetDeck(rng, opts.catalog) : opts.decks?.length ? opts.decks[rng.nextInt(opts.decks.length)]! : randomDeck(rng));
    const players: [DeckSource, DeckSource] = [pick(), pick()];
    const game = playBotGame({ seed: gameSeed, players: [{ leaderId: players[0].leaderId, deck: players[0].deck }, { leaderId: players[1].leaderId, deck: players[1].deck }], levels: ["normal", "normal"] });
    out.push(...samplePositions(game.replay, rng, opts.perGame, `sp${opts.seed}-g${g}`));
  }
  return out;
}

const pickOf = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.nextInt(xs.length)]!;

const cardPool = (catalog: Catalog, wantNew: boolean, types: string[]): Def[] =>
  listCardDefs().filter((d) => usable(d) && types.includes(d.type) && (!wantNew || NEW_SET.test(d.id)) && ["supported", "vanilla"].includes(catalog.cards.get(d.id)?.support ?? ""));


/** The card has an [On Play]: put on the field by the Harness it never resolved, so the board must not say it was just played. */
export const hasOnPlay = (catalog: Catalog, defId: string): boolean => {
  const row = catalog.cards.get(defId);
  return !row || row.text.includes("[On Play]") || row.timings.includes("on_play") || (catalog.abilities.get(defId) ?? []).some((a) => a.trigger === "on_play");
};

/**
 * A Harness board: Leaders, up to 5 Characters and maybe a Stage per side, DON!! attached to Leaders and Characters, a hand,
 * a trash, rested and just-played Characters. Seat 0 is in its Main Phase. With `wantNew`, most cards come from OP18 / EB05.
 */
export function syntheticPosition(rng: Rng, catalog: Catalog, wantNew: boolean, label: string): Position {
  const leaders = leaderDefs().filter((d) => ["supported", "vanilla"].includes(catalog.cards.get(d.id)?.support ?? ""));
  const newLeaders = leaders.filter((d) => NEW_SET.test(d.id));
  const leaderOf = () => (wantNew && newLeaders.length && rng.next() < 0.5 ? pickOf(rng, newLeaders) : pickOf(rng, leaders));
  const l0 = leaderOf();
  const l1 = leaderOf();
  const h = new Harness({ leaders: [l0.id, l1.id], seed: 1 + rng.nextInt(1_000_000) });
  const chars = cardPool(catalog, false, ["character"]);
  const newChars = cardPool(catalog, true, ["character"]);
  const anyCards = cardPool(catalog, false, ["character", "event", "stage"]);
  const newCards = cardPool(catalog, true, ["character", "event", "stage"]);
  const fromPool = (all: Def[], fresh: Def[]) => (wantNew && fresh.length && rng.next() < 0.6 ? pickOf(rng, fresh) : pickOf(rng, all));
  for (const seat of [0, 1] as Seat[]) {
    const p = h.state.players[seat];
    const leaderColors = p.leader && catalog.cards.get(p.leader.defId)?.colors ? catalog.cards.get(p.leader.defId)!.colors : [];
    const ofColor = (all: Def[]) => {
      const same = all.filter((d) => d.colors.some((c) => leaderColors.includes(c)));
      return same.length && rng.next() < 0.85 ? same : all;
    };
    const active = 1 + rng.nextInt(8);
    const rested = rng.nextInt(Math.min(4, 11 - active));
    h.don(seat, active, rested);
    const count = rng.nextInt(6);
    const onField = Array.from({ length: count }, () => fromPool(ofColor(chars), ofColor(newChars)).id);
    const placed = onField.length ? h.field(seat, ...onField) : [];
    for (const c of placed) {
      c.rested = rng.next() < 0.3;
      // "Played this turn" says its [On Play] has resolved, which a card set down by the Harness never did.
      if (seat === 0 && rng.next() < 0.3 && !hasOnPlay(catalog, c.defId)) {
        c.summoningSick = true;
        c.playedTurn = h.state.turnNumber;
      }
    }
    if (rng.next() < 0.2) h.stage(seat, fromPool(cardPool(catalog, false, ["stage"]), cardPool(catalog, true, ["stage"])).id);
    // DON!! attached: the Leader sometimes, each Character now and then, as many as the DON!! deck can give.
    const budget = () => h.state.players[seat].donDeck.length;
    if (rng.next() < 0.5 && budget() > 0) h.attach(seat, p.leader, Math.min(budget(), 1 + rng.nextInt(3)));
    for (const c of placed) if (rng.next() < 0.3 && budget() > 0) h.attach(seat, c, Math.min(budget(), 1 + rng.nextInt(2)));
    const handSize = seat === 0 ? 3 + rng.nextInt(5) : 2 + rng.nextInt(5);
    h.hand(seat, ...Array.from({ length: handSize }, () => fromPool(ofColor(anyCards), ofColor(newCards)).id));
    h.trash(seat, ...Array.from({ length: rng.nextInt(10) }, () => pickOf(rng, rng.next() < 0.5 ? chars : anyCards).id));
    h.life(seat, ...Array.from({ length: 3 + rng.nextInt(3) }, () => FILLER));
  }
  return { id: label, state: h.state, source: "harness", synthetic: true };
}

export function syntheticPositions(opts: { seed: number; count: number; newShare: number; catalog: Catalog }): Position[] {
  const rng = createSeededRng(opts.seed * 7919 + 13);
  const out: Position[] = [];
  for (let i = 0; i < opts.count; i += 1) {
    try {
      out.push(syntheticPosition(rng, opts.catalog, rng.next() < opts.newShare, `hx${opts.seed}-${i}`));
    } catch {
      // A Leader the Harness cannot start with its filler deck: skip that board.
    }
  }
  return out;
}

// --- lethal boards (#685) ---------------------------------------------------------------------

/** Card text once the reminder text in parentheses and the four plain keywords are taken out. */
const bareText = (text: string) => text.replace(/\([^)]*\)/g, "").replace(/\[(Blocker|Rush|Double Attack|Banish)\]/g, "").trim();
/** A [Counter] that only adds power to the Leader (or to one Leader or Character) for the battle: the one effect these events have. */
const SIMPLE_COUNTER = /\[Counter\] (?:Your Leader|Up to 1 of your Leader or Character cards) gains \+\d+ power during this battle\.\s*$/;

/** "[DON!! x1] [Your Turn] All of your Characters gain +1000 power": DON!! on the Leader changes other cards. */
const SHARES_DON = /\[DON!! x\d+\][^.]*Characters? gain[^.]*power/;

export type LethalPool = {
  /** Leaders whose text is only a static effect: nothing to activate or trigger in a single turn. */
  leaders: string[];
  /** Those among them that can lead the attack: none has a [DON!! xN] static that changes other cards' power, so DON!! on one card only changes that card. */
  attackLeaders: string[];
  /** Characters with no text but keywords ([Blocker], [Rush], [Double Attack], [Banish]). */
  chars: string[];
  blockers: string[];
  /** Characters with [Double Attack] or [Banish]. */
  heavy: string[];
  /** Characters that can be trashed for a Counter. */
  counterChars: string[];
  /** Counter Events that only add power during the battle. */
  events: string[];
  /** A Character with no [Trigger] and no Counter, used for every Life card so a taken Life card changes nothing. */
  lifeFiller: string;
};

const poolCache = new WeakMap<Catalog, LethalPool>();

/** The cards a lethal board may use, picked from the catalog's text and keywords. */
export function lethalPool(catalog: Catalog): LethalPool {
  const hit = poolCache.get(catalog);
  if (hit) return hit;
  const real = new Set(listCardDefs().filter(usable).map((d) => d.id));
  const rows = [...catalog.cards.values()].filter((r) => real.has(r.id) && ["supported", "vanilla"].includes(r.support)).sort((a, b) => a.id.localeCompare(b.id));
  const plainChar = (r: (typeof rows)[number]) =>
    r.type === "character" && r.power != null && !r.timings.length && !r.effects.length && !r.trigger && !bareText(r.text);
  const chars = rows.filter(plainChar);
  const filler = chars.find((c) => !c.counter && !c.keywords.length) ?? chars.find((c) => !c.counter);
  if (!filler) throw new Error("no Life filler card in the catalog");
  const pool: LethalPool = {
    leaders: rows.filter((r) => r.type === "leader" && !r.timings.length && r.life != null).map((r) => r.id),
    attackLeaders: rows.filter((r) => r.type === "leader" && !r.timings.length && r.life != null && !SHARES_DON.test(r.text)).map((r) => r.id),
    chars: chars.map((r) => r.id),
    blockers: chars.filter((r) => r.keywords.includes("Blocker")).map((r) => r.id),
    heavy: chars.filter((r) => r.keywords.includes("Double Attack") || r.keywords.includes("Banish")).map((r) => r.id),
    counterChars: chars.filter((r) => (r.counter ?? 0) > 0).map((r) => r.id),
    events: rows.filter((r) => r.type === "event" && r.timings.includes("counter") && r.effects.join() === "power" && (r.cost ?? 9) <= 2 && SIMPLE_COUNTER.test(r.text)).map((r) => r.id),
    lifeFiller: filler.id,
  };
  poolCache.set(catalog, pool);
  return pool;
}

/**
 * A Harness board built for the lethal puzzle: seat 0 (empty hand, 3 to 8 active DON!!, a Leader and 2 to 4 Characters that can
 * all attack, many with [Double Attack] or [Banish]) in its Main Phase against 1 to 4 Life cards that have no [Trigger], 1 to 3
 * Characters (most [Blocker], some rested) and a hand of 1 to 4 Counter cards. Only cards the engine runs with no choices to
 * make are used.
 */
export function lethalPosition(rng: Rng, catalog: Catalog, wantNew: boolean, label: string): Position {
  const pool = lethalPool(catalog);
  const fresh = (ids: string[]) => ids.filter((id) => NEW_SET.test(id));
  const pick = (ids: string[]) => {
    const news = fresh(ids);
    return wantNew && news.length && rng.next() < 0.6 ? pickOf(rng, news) : pickOf(rng, ids);
  };
  const power = (id: string) => catalog.cards.get(id)?.power ?? 0;
  const striker = pool.chars.filter((id) => power(id) >= 3000 && power(id) <= 8000);
  const heavy = pool.heavy.filter((id) => power(id) >= 3000 && power(id) <= 8000);
  const h = new Harness({ leaders: [pick(pool.attackLeaders), pick(pool.leaders)], seed: 1 + rng.nextInt(1_000_000), deckSize: 20 });
  // How many of something: the index of the share the roll lands in.
  const count = (shares: number[]) => {
    let roll = rng.next();
    return shares.findIndex((s) => (roll -= s) < 0);
  };
  h.don(0, 3 + count([0.05, 0.1, 0.15, 0.2, 0.2, 0.3]));
  h.don(1, rng.nextInt(4));
  h.field(0, ...Array.from({ length: 2 + count([0.2, 0.4, 0.4]) }, () => pick(heavy.length && rng.next() < 0.4 ? heavy : striker)));
  // Plenty of Life and of Blockers to get past: the order of the attacks and who takes the Blocker's block is what decides it.
  const defenders = h.field(1, ...Array.from({ length: 1 + count([0.3, 0.45, 0.25]) }, () => pick(rng.next() < 0.7 ? pool.blockers : pool.chars)));
  for (const c of defenders) if (rng.next() < 0.2) c.rested = true;
  h.life(0, ...Array.from({ length: 3 }, () => pool.lifeFiller));
  h.life(1, ...Array.from({ length: 1 + count([0.1, 0.25, 0.35, 0.3]) }, () => pool.lifeFiller));
  h.hand(1, ...Array.from({ length: 1 + count([0.3, 0.35, 0.25, 0.1]) }, () => (pool.events.length && rng.next() < 0.35 ? pick(pool.events) : pick(pool.counterChars))));
  return { id: label, state: h.state, source: "harness lethal", synthetic: true };
}
