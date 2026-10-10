/**
 * Match replays recorded by the game server: the seed, both decks in order and
 * every accepted intent. The engine is deterministic, so re-running these
 * inputs rebuilds the whole game. A replay holds both hands and decks, so it
 * is kept server-side and never sent to players as-is.
 */
import { applyIntent, createMatch, skipMulligans } from "./engine.js";
import { createSeededRng } from "./rng.js";
import { reseedMatch } from "./reseed.js";
import type { GameEvent, Intent, MatchState, Seat } from "./types.js";

export const MATCH_REPLAY_SCHEMA = 1;

export interface MatchReplay {
  schema: typeof MATCH_REPLAY_SCHEMA;
  /** RULES_VERSION and REGISTRY_HASH when the game was played; a later engine may replay it differently. */
  rulesVersion: string;
  registryHash: string;
  seed: number;
  firstSeat: Seat;
  /** The room skipped mulligans with the same rng that then drove every intent. */
  skipMulligans: boolean;
  /** Decks in the order they were dealt from (order feeds the shuffle). */
  players: [{ leaderId: string; deck: string[] }, { leaderId: string; deck: string[] }];
  /** Every non-Banish Life hit opened a private Life check (#352). Absent on older recordings: legacy flow. */
  lifeCheckEveryHit?: boolean;
  /** Private choices, hidden-zone selects and permuted deck ids (#369). Absent on older recordings: legacy flow. */
  privateChoicesV2?: boolean;
  intents: { seat: Seat; intent: Intent }[];
  /**
   * The room re-seeded the shuffle rng (an agreed undo must not repeat the old
   * draws). Before applying intent `atIntent` the rng restarts from `seed`, and with `shuffleDecks` both decks are reshuffled with it.
   * Absent on older recordings: one seed for the whole game.
   */
  reseeds?: { atIntent: number; seed: number; shuffleDecks?: boolean }[];
  /** How the game ended, including ends outside the engine (concede, timeout, leaving). */
  end?: { winner: Seat; reason: string };
}

export interface ReplayStep {
  seat: Seat;
  intent: Intent;
  events: GameEvent[];
  state: MatchState;
}

/** The match as dealt (mulligans skipped when the room skipped them), before the first intent. */
export function replayStart(replay: MatchReplay): MatchState {
  const state = createMatch({
    seed: replay.seed,
    firstSeat: replay.firstSeat,
    lifeCheckEveryHit: replay.lifeCheckEveryHit ?? false,
    privateChoicesV2: replay.privateChoicesV2 ?? false,
    players: [
      { leaderId: replay.players[0].leaderId, deck: [...replay.players[0].deck] },
      { leaderId: replay.players[1].leaderId, deck: [...replay.players[1].deck] },
    ],
  });
  return replay.skipMulligans ? skipMulligans(state, createSeededRng(replay.seed)) : state;
}

/** Re-seed the match for every reseed recorded at `i` (before intent `i`, or after the last one). */
function reseedAt(state: MatchState, replay: MatchReplay, i: number): MatchState {
  let next = state;
  for (const r of replay.reseeds ?? []) {
    if (r.atIntent === i) next = reseedMatch(next, r.seed, r.shuffleDecks === true);
  }
  return next;
}

/** Apply recorded intent `i` to the state before it. Throws if the room's accepted move is now illegal. */
export function replayApply(state: MatchState, replay: MatchReplay, i: number): { state: MatchState; events: GameEvent[] } {
  const { seat, intent } = replay.intents[i]!;
  const result = applyIntent(reseedAt(state, replay, i), intent, { seat, rng: createSeededRng(replay.seed) });
  if (!result.ok) {
    throw new Error(`Replay diverged at intent ${i} (${intent.type}): ${result.error?.message ?? "illegal"}`);
  }
  return { state: result.state, events: result.events };
}

/** Re-run a recorded game. Throws if an intent the room accepted is now illegal. */
export function replayMatch(replay: MatchReplay, onStep?: (step: ReplayStep) => void): MatchState {
  let state = replayStart(replay);
  replay.intents.forEach(({ seat, intent }, i) => {
    const applied = replayApply(state, replay, i);
    state = applied.state;
    onStep?.({ seat, intent, events: applied.events, state });
  });
  // An undo with no move since still left the live state on its fresh seed.
  return reseedAt(state, replay, replay.intents.length);
}
