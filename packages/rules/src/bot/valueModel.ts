/**
 * Learned win-probability model (#635): logistic regression over `extractFeatures`, fitted by src/sim/fitValue.ts on
 * self-play positions and committed as valueWeights.json. Pure and tiny; no card knowledge beyond the features.
 */
import { extractFeatures, FEATURE_NAMES } from "./features.js";
import weightsFile from "./valueWeights.json" with { type: "json" };
import type { MatchState, Seat } from "../types.js";

export interface ValueWeights {
  /** Order of `weights`; must equal FEATURE_NAMES (checked when the model loads). */
  names: string[];
  weights: number[];
  bias: number;
  /** Fit report: samples, held-out log-loss and accuracy. */
  fit?: Record<string, unknown>;
}

export const VALUE_WEIGHTS: ValueWeights = weightsFile as ValueWeights;

/** Logit (log odds that `seat` wins) of a feature vector under `w`. */
export function logitOf(features: readonly number[], w: ValueWeights = VALUE_WEIGHTS): number {
  let z = w.bias;
  for (let i = 0; i < features.length; i += 1) z += (w.weights[i] ?? 0) * features[i]!;
  return z;
}

export const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

/** Log odds that `seat` wins a game still in progress. */
export function learnedLogit(state: MatchState, seat: Seat, w: ValueWeights = VALUE_WEIGHTS): number {
  return logitOf(extractFeatures(state, seat), w);
}

/** True when the committed weights line up with the current feature list (a stale file would silently misweigh features). */
export function weightsMatchFeatures(w: ValueWeights = VALUE_WEIGHTS): boolean {
  return w.names.length === FEATURE_NAMES.length && w.names.every((n, i) => n === FEATURE_NAMES[i]);
}
