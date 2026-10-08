/**
 * Per-move cost on the game server: seeded random games with constructed
 * decks for current leaders, timing `applyIntent` and the per-seat views that
 * `DuelRoom.broadcastViews` builds after every move (`getPlayerView` for both
 * seats plus `projectGameEvents`).
 *
 * `--gate` exits 1 when the cached views are not GATE_MIN_SPEEDUP times faster
 * than the same views with the query cache off (machine-independent, for CI).
 *
 * Usage: npx tsx src/scripts/benchViews.ts [games] [firstSeed] [--gate]
 */
import { listCardDefs } from "../cards/definitions.js";
import { abilitiesFor } from "../cards/abilities.js";
import { applyIntent, createMatch, listLegalIntents, skipMulligans } from "../engine.js";
import { setQueryCacheEnabled } from "../engine/queries.js";
import { getPlayerView, projectGameEvents } from "../engine/views.js";
import { createSeededRng } from "../rng.js";
import { actingSeat, randomAnswer } from "../sim/fuzz.js";
import type { GameEvent, Intent, MatchState, Seat } from "../types.js";

/** Leaders of current sets; each gets a 50-card same-colour deck built from the catalog. */
export const BENCH_LEADERS = ["OP13-079", "OP14-041", "OP16-080", "OP17-001", "OP17-039", "ST30-001"] as const;

/**
 * Deterministic 50-card deck for `leaderId`: 4 copies each of same-colour cards,
 * preferring cards that share a type with the leader and have scripted abilities,
 * the way a constructed list is mostly on-type engine cards.
 */
export function benchDeck(leaderId: string): { leaderId: string; deck: string[] } {
  const defs = listCardDefs().filter((d) => d.dataSource !== "stub");
  const leader = defs.find((d) => d.id === leaderId && d.type === "leader");
  if (!leader) throw new Error(`Unknown leader ${leaderId}`);
  const traits = new Set(leader.traits ?? []);
  const score = (id: string) => {
    const def = defs.find((d) => d.id === id)!;
    return ((def.traits ?? []).some((t) => traits.has(t)) ? 2 : 0) + (abilitiesFor(id).length > 0 ? 1 : 0);
  };
  const pool = defs
    .filter((d) => d.type !== "leader" && d.colors.some((c) => leader.colors.includes(c)))
    .map((d) => d.id)
    .sort((a, b) => score(b) - score(a) || a.localeCompare(b));
  // Spread picks over the pool rather than taking one set's run of card numbers.
  const top = pool.slice(0, Math.max(26, Math.min(pool.length, 60)));
  const picked = createSeededRng(leaderId.split("").reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7)).shuffle(top).slice(0, 13);
  const deck: string[] = [];
  for (const id of picked) for (let i = 0; i < 4 && deck.length < 50; i += 1) deck.push(id);
  return { leaderId, deck };
}

export interface BenchStep {
  /** State after the intent was applied (what the server broadcasts). */
  state: MatchState;
  events: GameEvent[];
  applyMicros: number;
}

/**
 * Plays one seeded random game between two bench leaders and yields after
 * every applied intent. Random choice answers fall back to the default answer
 * when a random one breaks a constraint, as in the fuzzer.
 */
export function* benchGame(seed: number, maxIntents = 400): Generator<BenchStep> {
  const rng = createSeededRng(seed);
  const a = BENCH_LEADERS[seed % BENCH_LEADERS.length]!;
  const b = BENCH_LEADERS[(seed + 1 + Math.floor(seed / BENCH_LEADERS.length)) % BENCH_LEADERS.length]!;
  let state = createMatch({ seed, firstSeat: (seed % 2) as Seat, players: [benchDeck(a), benchDeck(b)] });
  state = skipMulligans(state, rng);
  for (let intents = 0; intents < maxIntents && state.winner === null; intents += 1) {
    const seat = actingSeat(state);
    const legal = listLegalIntents(state, seat);
    if (legal.length === 0) throw new Error(`No legal intents seed=${seed} intent=${intents} phase=${state.phase}`);
    const front = state.pendingChoices[0];
    let pick: Intent;
    if (front && front.seat === seat && rng.next() < 0.8) pick = randomAnswer(rng, front);
    else {
      const end = legal.find((i) => i.type === "end_turn");
      pick = end && rng.next() < 0.15 ? end : legal[rng.nextInt(legal.length)]!;
    }
    const started = performance.now();
    let r = applyIntent(state, pick, { seat, rng });
    if (!r.ok && front) r = applyIntent(state, legal[0]!, { seat, rng });
    const applyMicros = (performance.now() - started) * 1000;
    if (!r.ok) throw new Error(`Rejected legal intent seed=${seed}: ${r.error?.message}`);
    state = r.state;
    yield { state, events: r.events, applyMicros };
  }
}

/** What `broadcastViews` builds for two seated players after one move. */
export function buildSeatViews(state: MatchState, events: readonly GameEvent[]) {
  return [0, 1].map((seat) => ({ view: getPlayerView(state, seat as Seat), events: projectGameEvents(events, seat as Seat) }));
}

export interface BenchResult { games: number; moves: number; applyMicros: number; viewMicros: number; uncachedViewMicros: number }

/**
 * Mean µs per move for `applyIntent` and for the two seats' views, plus the same
 * views with the query cache turned off. Both view paths run on every state, in
 * alternating order, so the ratio between them does not depend on the machine.
 */
export function runBench(games: number, firstSeed: number): BenchResult {
  let moves = 0;
  let applyTotal = 0;
  let viewTotal = 0;
  let uncachedTotal = 0;
  const timeViews = (step: BenchStep, cached: boolean) => {
    setQueryCacheEnabled(cached);
    const started = performance.now();
    buildSeatViews(step.state, step.events);
    return (performance.now() - started) * 1000;
  };
  try {
    for (let seed = firstSeed; seed < firstSeed + games; seed += 1) {
      for (const step of benchGame(seed)) {
        if (moves % 2 === 0) { viewTotal += timeViews(step, true); uncachedTotal += timeViews(step, false); }
        else { uncachedTotal += timeViews(step, false); viewTotal += timeViews(step, true); }
        setQueryCacheEnabled(true);
        applyTotal += step.applyMicros;
        moves += 1;
      }
    }
  } finally {
    setQueryCacheEnabled(true);
  }
  return { games, moves, applyMicros: applyTotal / moves, viewMicros: viewTotal / moves, uncachedViewMicros: uncachedTotal / moves };
}

/** CI gate: the cached views must stay at least this many times faster than the uncached path. */
export const GATE_MIN_SPEEDUP = 1.8;

if (process.argv[1] && /benchViews\.ts$/.test(process.argv[1])) {
  const args = process.argv.slice(2);
  const gate = args.includes("--gate");
  const [games = 12, firstSeed = 1] = args.filter((a) => !a.startsWith("--")).map(Number);
  runBench(2, 1000); // warm-up (JIT, card-definition caches)
  const r = runBench(games, firstSeed);
  const speedup = r.uncachedViewMicros / r.viewMicros;
  console.log(`bench:views ${r.games} games, ${r.moves} moves: applyIntent ${r.applyMicros.toFixed(1)} µs/move, views ${r.viewMicros.toFixed(1)} µs/move (uncached ${r.uncachedViewMicros.toFixed(1)} µs/move, ${speedup.toFixed(2)}x)`);
  if (gate && speedup < GATE_MIN_SPEEDUP) {
    console.error(`FAIL cached views are ${speedup.toFixed(2)}x faster than uncached; the gate requires ${GATE_MIN_SPEEDUP}x`);
    process.exit(1);
  }
}
