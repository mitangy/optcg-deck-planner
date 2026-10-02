/**
 * Match replays recorded by the game server: the seed, both decks in order and
 * every accepted intent. The engine is deterministic, so re-running these
 * inputs rebuilds the whole game. A replay holds both hands and decks, so it
 * is kept server-side and never sent to players as-is.
 */
import { applyIntent, createMatch, skipMulligans } from "./engine.js";
import { createSeededRng } from "./rng.js";
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
  intents: { seat: Seat; intent: Intent }[];
  /** How the game ended, including ends outside the engine (concede, timeout, leaving). */
  end?: { winner: Seat; reason: string };
}

export interface ReplayStep {
  seat: Seat;
  intent: Intent;
  events: GameEvent[];
  state: MatchState;
}

/** Re-run a recorded game. Throws if an intent the room accepted is now illegal. */
export function replayMatch(replay: MatchReplay, onStep?: (step: ReplayStep) => void): MatchState {
  const rng = createSeededRng(replay.seed);
  let state = createMatch({
    seed: replay.seed,
    firstSeat: replay.firstSeat,
    players: [
      { leaderId: replay.players[0].leaderId, deck: [...replay.players[0].deck] },
      { leaderId: replay.players[1].leaderId, deck: [...replay.players[1].deck] },
    ],
  });
  if (replay.skipMulligans) state = skipMulligans(state, rng);
  replay.intents.forEach(({ seat, intent }, i) => {
    const result = applyIntent(state, intent, { seat, rng });
    if (!result.ok) {
      throw new Error(`Replay diverged at intent ${i} (${intent.type}): ${result.error?.message ?? "illegal"}`);
    }
    state = result.state;
    onStep?.({ seat, intent, events: result.events, state });
  });
  return state;
}
