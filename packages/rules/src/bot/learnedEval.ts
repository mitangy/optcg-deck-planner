/**
 * The hard bot's learned position score (#635): the log odds that `seat` wins, from the fitted model in valueWeights.json.
 * Same contract as evaluate(): a finished game is a large win/loss (earlier wins score slightly higher). Units are log odds,
 * not "cards", so margins that were written for the hand-tuned score (search.ts HARD_DEFAULTS.margin) do not carry over.
 */
import { extractFeatures } from "./features.js";
import { logitOf, VALUE_WEIGHTS, type ValueWeights } from "./valueModel.js";
import type { MatchState, Seat } from "../types.js";

export const LEARNED = {
  /** Score of a finished game; far past any model logit (clamped to +-CLAMP) so a sure win beats every estimate. */
  win: 14,
  winPerSpareTurn: 0.02,
  /** The model is fitted on turn-start positions; a position it calls hopeless or won is never trusted past this. */
  clamp: 8,
} as const;

export function evaluateLearned(state: MatchState, seat: Seat, startTurn = state.turnNumber, w: ValueWeights = VALUE_WEIGHTS): number {
  if (state.winner !== null) {
    const spare = Math.max(0, 40 - (state.turnNumber - startTurn)) * LEARNED.winPerSpareTurn;
    return state.winner === seat ? LEARNED.win + spare : -LEARNED.win - spare;
  }
  const z = logitOf(extractFeatures(state, seat), w);
  return Math.max(-LEARNED.clamp, Math.min(LEARNED.clamp, z));
}
