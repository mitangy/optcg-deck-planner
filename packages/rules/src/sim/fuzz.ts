/**
 * Whole-catalog fuzzer: random legal decks (all printed cards, any support
 * status), random legal intents and random choice answers. Checks invariants
 * after every step and that every legal intent is accepted.
 *
 * Usage: npx tsx src/sim/fuzz.ts [games] [seed]
 */
import { listCardDefs } from "../cards/definitions.js";
import { abilitiesFor } from "../cards/abilities.js";
import { applyIntent, assertInvariants, createMatch, listLegalIntents, skipMulligans } from "../engine.js";
import { createSeededRng, type Rng } from "../rng.js";
import type { ChoiceRequest, Intent, MatchState, PendingChoice, Seat } from "../types.js";

export function actingSeat(state: MatchState): Seat {
  if (state.phase === "mulligan") return state.players[0].mulliganDone ? 1 : 0;
  if (state.pendingChoices.length > 0) return state.pendingChoices[0]!.seat;
  if ((state.phase === "block" || state.phase === "counter") && state.battle) return state.battle.attackerSeat === 0 ? 1 : 0;
  return state.activeSeat;
}

const defs = listCardDefs().filter((d) => d.dataSource !== "stub");
const leaders = defs.filter((d) => d.type === "leader" && d.life != null);
const mainCards = defs.filter((d) => d.type !== "leader");

export function randomDeck(rng: Rng, focus?: string[]): { leaderId: string; deck: string[] } {
  const leader = leaders[rng.nextInt(leaders.length)]!;
  const pool = mainCards.filter((d) => d.colors.some((c) => leader.colors.includes(c)));
  const deck: string[] = [];
  for (const id of focus ?? []) for (let i = 0; i < 4 && deck.length < 50; i += 1) deck.push(id);
  while (deck.length < 50) {
    const card = pool[rng.nextInt(pool.length)]!;
    if (deck.filter((id) => id === card.id).length < 4) deck.push(card.id);
  }
  return { leaderId: leader.id, deck };
}

function shuffleIds<T>(rng: Rng, items: T[]): T[] {
  return rng.shuffle(items);
}

/** Random valid answer for a choice (not just the default). */
export function randomAnswer(rng: Rng, choice: PendingChoice): Intent {
  if (choice.kind === "order_effects") return { type: "order_pending_effects", orderedIds: shuffleIds(rng, (choice.unorderedChoices ?? []).map((c) => c.id)) };
  const r: ChoiceRequest | undefined = choice.request;
  if (!r || r.type === "confirm") return { type: "resolve_pending_choice", accept: choice.optional ? rng.next() < 0.7 : true };
  switch (r.type) {
    case "mode": return { type: "resolve_pending_choice", accept: true, selectedOptionIds: [r.options[rng.nextInt(r.options.length)]!.id] };
    case "select": {
      const eligible = shuffleIds(rng, r.options.filter((o) => o.eligible).map((o) => o.id));
      const n = r.min + rng.nextInt(r.max - r.min + 1);
      return { type: "resolve_pending_choice", accept: true, selectedOptionIds: eligible.slice(0, n) };
    }
    case "order": {
      const ids = shuffleIds(rng, r.options.map((o) => o.id));
      return { type: "resolve_pending_choice", accept: true, orderedOptionIds: ids, ...(r.allowTopOrBottom ? { topOptionIds: rng.next() < 0.5 ? ids : [] } : {}) };
    }
    case "look": {
      const picked: string[] = [];
      const capacity = r.groups.map((g) => g.max);
      for (const o of shuffleIds(rng, r.options.map((x) => x.id))) {
        const g = r.groups.findIndex((grp, gi) => capacity[gi]! > 0 && grp.eligibleIds.includes(o));
        if (g >= 0 && rng.next() < 0.8) { capacity[g]! -= 1; picked.push(o); }
      }
      const rest = shuffleIds(rng, r.options.map((o) => o.id).filter((id) => !picked.includes(id)));
      return { type: "resolve_pending_choice", accept: true, selectedOptionIds: picked, orderedOptionIds: rest, ...(r.rest === "top_or_bottom" ? { topOptionIds: rng.next() < 0.5 ? rest : [] } : {}) };
    }
  }
}

export interface FuzzResult { finished: boolean; intents: number; error?: string; deckIds: string[] }

export function fuzzGame(seed: number, maxIntents = 1500, focus?: string[]): FuzzResult {
  const rng = createSeededRng(seed);
  const a = randomDeck(rng, focus);
  const b = randomDeck(rng, focus);
  const deckIds = [...new Set([a.leaderId, b.leaderId, ...a.deck, ...b.deck])];
  let state = createMatch({ seed, firstSeat: (seed % 2) as Seat, players: [a, b] });
  state = skipMulligans(state, rng);
  let intents = 0;
  try {
    while (intents < maxIntents && state.winner === null) {
      assertInvariants(state);
      const seat = actingSeat(state);
      const legal = listLegalIntents(state, seat);
      if (legal.length === 0) throw new Error(`No legal intents phase=${state.phase} seat=${seat} pending=${JSON.stringify(state.pendingChoices[0]?.request?.type)}`);
      const front = state.pendingChoices[0];
      let pick: Intent;
      if (front && front.seat === seat && rng.next() < 0.8) pick = randomAnswer(rng, front);
      else {
        const end = legal.find((i) => i.type === "end_turn");
        pick = end && rng.next() < 0.15 ? end : legal[rng.nextInt(legal.length)]!;
      }
      let r = applyIntent(state, pick, { seat, rng });
      if (!r.ok && front) {
        // A random answer may legitimately violate a constraint (e.g. total cost); fall back to the default.
        r = applyIntent(state, legal[0]!, { seat, rng });
      }
      if (!r.ok) throw new Error(`Rejected legal intent ${JSON.stringify(pick)}: ${r.error?.message} (pending=${JSON.stringify(front?.prompt)})`);
      state = r.state;
      intents += 1;
    }
    assertInvariants(state);
  } catch (error) {
    const last = state.lastEvents.filter((e) => e.type === "ability_activated").map((e) => (e as { defId: string; text: string }).defId + ": " + (e as { text: string }).text).slice(-3).join(" | ");
    return { finished: false, intents, error: `${(error as Error).message}\n    frames=${JSON.stringify(state.resolutionFrames.map((f) => f.abilityId))} lastAbilities=${last}\n    ${(error as Error).stack?.split("\n").slice(1, 4).join("\n    ")}`, deckIds };
  }
  return { finished: state.winner !== null, intents, deckIds };
}

/**
 * Sweep: focused decks cycling through every catalog card (4 copies each of
 * `chunk` cards per deck), reporting abilities that never activated.
 */
export function sweep(chunk = 10, gamesPerChunk = 2, base = 90000): { errors: string[]; activated: Set<string> } {
  const ids = mainCards.map((d) => d.id);
  const errors: string[] = [];
  const activated = new Set<string>();
  for (let i = 0; i < ids.length; i += chunk) {
    const focus = ids.slice(i, i + chunk);
    for (let g = 0; g < gamesPerChunk; g += 1) {
      const seed = base + i * gamesPerChunk + g;
      const result = fuzzGameTracked(seed, focus, activated);
      if (result.error) errors.push(`seed ${seed} focus=${focus.join(",")}: ${result.error}`);
    }
  }
  return { errors, activated };
}

function fuzzGameTracked(seed: number, focus: string[], activated: Set<string>): FuzzResult {
  const rng = createSeededRng(seed);
  const a = randomDeck(rng, focus);
  const b = randomDeck(rng, focus.slice().reverse());
  let state = createMatch({ seed, firstSeat: (seed % 2) as Seat, players: [a, b] });
  state = skipMulligans(state, rng);
  let intents = 0;
  try {
    while (intents < 1500 && state.winner === null) {
      const seat = actingSeat(state);
      const legal = listLegalIntents(state, seat);
      if (legal.length === 0) throw new Error(`No legal intents phase=${state.phase}`);
      const front = state.pendingChoices[0];
      // Prefer playing and activating so focused cards resolve.
      const eager = legal.filter((i) => i.type === "play_card" || i.type === "activate_ability" || i.type === "declare_attack" || i.type === "counter_event");
      const pick = front && front.seat === seat && rng.next() < 0.85 ? randomAnswer(rng, front) : eager.length && rng.next() < 0.8 ? eager[rng.nextInt(eager.length)]! : legal[rng.nextInt(legal.length)]!;
      let r = applyIntent(state, pick, { seat, rng });
      if (!r.ok && front) r = applyIntent(state, legal[0]!, { seat, rng });
      if (!r.ok) throw new Error(`Rejected legal intent ${JSON.stringify(pick)}: ${r.error?.message}`);
      for (const e of r.events) if (e.type === "ability_activated") activated.add(e.abilityId);
      state = r.state;
      assertInvariants(state);
      intents += 1;
    }
  } catch (error) {
    return { finished: false, intents, error: `${(error as Error).message} ${(error as Error).stack?.split("\n").slice(1, 3).join(" ")}`, deckIds: focus };
  }
  return { finished: state.winner !== null, intents, deckIds: focus };
}

if (process.argv[1] && /fuzz\.ts$/.test(process.argv[1]) && process.argv[2] === "--sweep") {
  const { errors, activated } = sweep(Number(process.argv[3] ?? 10), Number(process.argv[4] ?? 2));
  for (const e of errors.slice(0, 15)) console.log(e);
  const all = listCardDefs().flatMap((d) => abilitiesFor(d.id).filter((a) => a.trigger !== "static" && a.trigger !== "replacement").map((a) => a.id));
  const never = all.filter((id) => !activated.has(id));
  console.log(`sweep: ${errors.length} errors; activated ${activated.size}/${all.length} triggered/activated abilities; never: ${never.length}`);
  if (process.argv.includes("--list")) console.log(never.join(" "));
  if (errors.length) process.exit(1);
} else if (process.argv[1] && /fuzz\.ts$/.test(process.argv[1])) {
  const games = Number(process.argv[2] ?? 50);
  const base = Number(process.argv[3] ?? 1);
  let finished = 0;
  let errors = 0;
  const started = Date.now();
  let totalIntents = 0;
  for (let i = 0; i < games; i += 1) {
    const result = fuzzGame(base + i);
    totalIntents += result.intents;
    if (result.finished) finished += 1;
    if (result.error) { errors += 1; if (errors <= 8) console.log(`seed ${base + i}: ${result.error}`); }
  }
  const ms = Date.now() - started;
  console.log(`fuzz: ${games} games, ${finished} finished, ${errors} errors, ${totalIntents} intents, ${(ms / Math.max(1, totalIntents)).toFixed(2)} ms/intent`);
  if (errors) process.exit(1);
}
