/**
 * Learned win-probability model (#635): fitted by src/sim/fitValue.ts on self-play positions and committed as valueWeights.json
 * (currently the v2 MLP without the card bag, see HARD_DEFAULTS.evalMode in search.ts). Pure and tiny; no card knowledge beyond the features.
 *
 * A model file is one of two kinds (experiments load others through BotOptions.valueWeights / versus.ts `weights=`):
 *  - linear (the committed format, `kind` absent): bias + weights . features. With `featureSet: "v2"` it also has `vocab`
 *    and `bagWeights` (one weight per card-bag slot, see features.ts BAG_SLOTS).
 *  - mlp: one ReLU hidden layer. Dense inputs are standardised with `mean`/`std`; the sparse card-bag inputs are not
 *    (standardising would make them dense), their columns are W1[j][names.length + slot].
 */
import { extractFeatures, extractFeaturesV2, FEATURE_NAMES, FEATURE_NAMES_V2 } from "./features.js";
import weightsFile from "./valueWeights.json" with { type: "json" };
import type { MatchState, Seat } from "../types.js";

export type FeatureSet = "v1" | "v2";

export interface ValueWeights {
  kind?: "linear";
  /** Default "v1". */
  featureSet?: FeatureSet;
  /** Order of `weights`; must equal FEATURE_NAMES (v1) or FEATURE_NAMES_V2 (v2) (checked when the model loads). */
  names: string[];
  weights: number[];
  bias: number;
  /** v2: card def ids of the bag; slot s of card i is 2 * i + s. */
  vocab?: string[];
  /** v2: one weight per bag slot (2 * vocab.length). */
  bagWeights?: number[];
  /** Fit report: samples, held-out log-loss and accuracy. */
  fit?: Record<string, unknown>;
}

export interface MlpModel {
  kind: "mlp";
  featureSet: FeatureSet;
  /** Dense feature names, as for ValueWeights. */
  names: string[];
  /** v2: card def ids of the sparse bag inputs. */
  vocab?: string[];
  /** Standardisation of the dense inputs (length names.length). */
  mean: number[];
  std: number[];
  /** W1 is h x (names.length + 2 * vocab.length); the output logit is w2 . relu(W1 x + b1) + b2. */
  hidden: { W1: number[][]; b1: number[]; w2: number[]; b2: number };
  fit?: Record<string, unknown>;
}

export type ValueModel = ValueWeights | MlpModel;

export const VALUE_WEIGHTS: ValueModel = weightsFile as ValueModel;

export const isMlp = (m: ValueModel): m is MlpModel => m.kind === "mlp";
export const featureSetOf = (m: ValueModel): FeatureSet => m.featureSet ?? "v1";

const NO_INDEX: readonly number[] = [];

/** Logit (log odds that `seat` wins) of a dense feature vector under `w` (no card bag). */
export function logitOf(features: readonly number[], w: ValueModel = VALUE_WEIGHTS): number {
  if (isMlp(w)) return mlpLogit(w, features, NO_INDEX, NO_INDEX);
  let z = w.bias;
  for (let i = 0; i < features.length; i += 1) z += (w.weights[i] ?? 0) * features[i]!;
  return z;
}

/** Logit of a dense vector plus sparse bag entries (`idx[k]` = bag slot, `val[k]` = its value). */
export function logitOfParts(w: ValueModel, dense: readonly number[], idx: readonly number[], val: readonly number[]): number {
  if (isMlp(w)) return mlpLogit(w, dense, idx, val);
  let z = logitOf(dense, w);
  const bag = w.bagWeights;
  if (bag) for (let k = 0; k < idx.length; k += 1) z += (bag[idx[k]!] ?? 0) * val[k]!;
  return z;
}

export const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

/** Log odds that `seat` wins a game still in progress, with the feature extractor `w` was fitted on. */
export function learnedLogit(state: MatchState, seat: Seat, w: ValueModel = VALUE_WEIGHTS): number {
  if (featureSetOf(w) === "v1") return logitOf(extractFeatures(state, seat), w);
  const f = extractFeaturesV2(state, seat, w.vocab);
  return logitOfParts(w, f.dense, f.idx, f.val);
}

/** True when the model's feature names line up with the current feature list (a stale file would silently misweigh features). */
export function weightsMatchFeatures(w: ValueModel = VALUE_WEIGHTS): boolean {
  const expected = featureSetOf(w) === "v2" ? FEATURE_NAMES_V2 : FEATURE_NAMES;
  return w.names.length === expected.length && w.names.every((n, i) => n === expected[i]);
}

// --- MLP inference -------------------------------------------------------------------------------------------------

/** The network with standardisation folded into the first layer, in flat typed arrays; built once per model object. */
interface Compiled {
  dd: number;
  h: number;
  /** h x dd, row j = hidden unit j. */
  Wd: Float64Array;
  /** ns x h, row s = bag slot s (contiguous over hidden units). */
  Ws: Float64Array;
  b1: Float64Array;
  w2: Float64Array;
  b2: number;
  /** Scratch for the hidden activations (inference is synchronous). */
  act: Float64Array;
}

const compiled = new WeakMap<MlpModel, Compiled>();

function compile(m: MlpModel): Compiled {
  const { W1, b1, w2, b2 } = m.hidden;
  const h = W1.length;
  const dd = m.names.length;
  const ns = (m.vocab?.length ?? 0) * 2;
  if (b1.length !== h || w2.length !== h || m.mean.length !== dd || m.std.length !== dd || W1.some((row) => row.length !== dd + ns)) {
    throw new Error(`mlp value model is inconsistent: ${h} hidden units, ${dd} dense inputs, ${ns} bag slots`);
  }
  const Wd = new Float64Array(h * dd);
  const Ws = new Float64Array(ns * h);
  const fb = new Float64Array(b1);
  for (let j = 0; j < h; j += 1) {
    const row = W1[j]!;
    for (let i = 0; i < dd; i += 1) {
      const wi = row[i]! / (m.std[i] || 1);
      Wd[j * dd + i] = wi;
      fb[j]! -= wi * m.mean[i]!;
    }
    for (let s = 0; s < ns; s += 1) Ws[s * h + j] = row[dd + s]!;
  }
  return { dd, h, Wd, Ws, b1: fb, w2: Float64Array.from(w2), b2, act: new Float64Array(h) };
}

function mlpLogit(m: MlpModel, dense: readonly number[], idx: readonly number[], val: readonly number[]): number {
  let c = compiled.get(m);
  if (!c) { c = compile(m); compiled.set(m, c); }
  const { dd, h, Wd, Ws, b1, w2, act } = c;
  for (let j = 0; j < h; j += 1) {
    let s = b1[j]!;
    const base = j * dd;
    for (let i = 0; i < dd; i += 1) s += Wd[base + i]! * dense[i]!;
    act[j] = s;
  }
  for (let k = 0; k < idx.length; k += 1) {
    const base = idx[k]! * h;
    const v = val[k]!;
    for (let j = 0; j < h; j += 1) act[j]! += Ws[base + j]! * v;
  }
  let z = c.b2;
  for (let j = 0; j < h; j += 1) {
    const a = act[j]!;
    if (a > 0) z += w2[j]! * a;
  }
  return z;
}
