/** A replay holds both hands and decks, so it is kept server-side and never sent to players as-is. */
import { applyIntent, createMatch, skipMulligans } from "../engine.js";
import { reseedMatch } from "./reseed.js";
import type { GameEvent, Intent, MatchState, Seat } from "../types.js";

export const MATCH_REPLAY_SCHEMA = 1;

export interface MatchReplay {
  schema: typeof MATCH_REPLAY_SCHEMA;
  /** RULES_VERSION and REGISTRY_HASH when the game was played; a later engine may replay it differently. */
  rulesVersion: string;
  registryHash: string;
  seed: number;
  /** 256-bit hex key of a keyed match. Kept server-side until the game is over; a replay without it only replays keyless matches. */
  rngKey?: string;
  firstSeat: Seat;
  /** The room skipped mulligans with the same rng that then drove every intent. */
  skipMulligans: boolean;
  /** Decks in the order they were dealt from (order feeds the shuffle). */
  players: [{ leaderId: string; deck: string[] }, { leaderId: string; deck: string[] }];
  lifeCheckEveryHit?: boolean;
  privateChoicesV2?: boolean;
  intents: { seat: Seat; intent: Intent }[];
  /** An agreed undo must not repeat the old draws, so the room re-seeds the shuffle rng. */
  reseeds?: { atIntent: number; seed: number; shuffleDecks?: boolean }[];
  end?: { winner: Seat; reason: string };
}

export interface ReplayStep {
  seat: Seat;
  intent: Intent;
  events: GameEvent[];
  state: MatchState;
}

export function replayStart(replay: MatchReplay): MatchState {
  const state = createMatch({
    seed: replay.seed,
    ...(replay.rngKey ? { rngKey: replay.rngKey } : {}),
    firstSeat: replay.firstSeat,
    lifeCheckEveryHit: replay.lifeCheckEveryHit ?? false,
    privateChoicesV2: replay.privateChoicesV2 ?? false,
    players: [
      { leaderId: replay.players[0].leaderId, deck: [...replay.players[0].deck] },
      { leaderId: replay.players[1].leaderId, deck: [...replay.players[1].deck] },
    ],
  });
  return replay.skipMulligans ? skipMulligans(state) : state;
}

function reseedAt(state: MatchState, replay: MatchReplay, i: number): MatchState {
  let next = state;
  for (const r of replay.reseeds ?? []) {
    if (r.atIntent === i) next = reseedMatch(next, r.seed, r.shuffleDecks === true);
  }
  return next;
}

export function replayApply(state: MatchState, replay: MatchReplay, i: number): { state: MatchState; events: GameEvent[] } {
  const { seat, intent } = replay.intents[i]!;
  const result = applyIntent(reseedAt(state, replay, i), intent, { seat });
  if (!result.ok) {
    throw new Error(`Replay diverged at intent ${i} (${intent.type}): ${result.error?.message ?? "illegal"}`);
  }
  return { state: result.state, events: result.events };
}

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
