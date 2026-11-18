import { learnedLogit, VALUE_WEIGHTS, type ValueModel } from "./valueModel.js";
import type { MatchState, Seat } from "../types.js";

export const LEARNED = {
  /** Score of a finished game; far past any model logit (clamped to +-CLAMP) so a sure win beats every estimate. */
  win: 14,
  winPerSpareTurn: 0.02,
  /** The model is fitted on turn-start positions; a position it calls hopeless or won is never trusted past this. */
  clamp: 8,
} as const;

export function evaluateLearned(state: MatchState, seat: Seat, startTurn = state.turnNumber, w: ValueModel = VALUE_WEIGHTS): number {
  if (state.winner !== null) {
    const spare = Math.max(0, 40 - (state.turnNumber - startTurn)) * LEARNED.winPerSpareTurn;
    return state.winner === seat ? LEARNED.win + spare : -LEARNED.win - spare;
  }
  const z = learnedLogit(state, seat, w);
  return Math.max(-LEARNED.clamp, Math.min(LEARNED.clamp, z));
}
