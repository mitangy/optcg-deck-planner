import { extractFeatures, extractFeaturesV2, FEATURE_NAMES, FEATURE_NAMES_V2 } from "./features.js";
import weightsFile from "./valueWeights.json" with { type: "json" };
import type { MatchState, Seat } from "../types.js";

export type FeatureSet = "v1" | "v2";

export interface ValueWeights {
  kind?: "linear";
  featureSet?: FeatureSet;
  names: string[];
  weights: number[];
  bias: number;
  vocab?: string[];
  bagWeights?: number[];
  fit?: Record<string, unknown>;
}

export interface MlpModel {
  kind: "mlp";
  featureSet: FeatureSet;
  names: string[];
  vocab?: string[];
  mean: number[];
  std: number[];
  hidden: { W1: number[][]; b1: number[]; w2: number[]; b2: number };
  fit?: Record<string, unknown>;
}

export type ValueModel = ValueWeights | MlpModel;

export const VALUE_WEIGHTS: ValueModel = weightsFile as ValueModel;

export const isMlp = (m: ValueModel): m is MlpModel => m.kind === "mlp";
export const featureSetOf = (m: ValueModel): FeatureSet => m.featureSet ?? "v1";

const NO_INDEX: readonly number[] = [];

export function logitOf(features: readonly number[], w: ValueModel = VALUE_WEIGHTS): number {
  if (isMlp(w)) return mlpLogit(w, features, NO_INDEX, NO_INDEX);
  let z = w.bias;
  for (let i = 0; i < features.length; i += 1) z += (w.weights[i] ?? 0) * features[i]!;
  return z;
}

export function logitOfParts(w: ValueModel, dense: readonly number[], idx: readonly number[], val: readonly number[]): number {
  if (isMlp(w)) return mlpLogit(w, dense, idx, val);
  let z = logitOf(dense, w);
  const bag = w.bagWeights;
  if (bag) for (let k = 0; k < idx.length; k += 1) z += (bag[idx[k]!] ?? 0) * val[k]!;
  return z;
}

export const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

export function learnedLogit(state: MatchState, seat: Seat, w: ValueModel = VALUE_WEIGHTS): number {
  if (featureSetOf(w) === "v1") return logitOf(extractFeatures(state, seat), w);
  const f = extractFeaturesV2(state, seat, w.vocab);
  return logitOfParts(w, f.dense, f.idx, f.val);
}

/** A stale file would silently misweigh features. */
export function weightsMatchFeatures(w: ValueModel = VALUE_WEIGHTS): boolean {
  const expected = featureSetOf(w) === "v2" ? FEATURE_NAMES_V2 : FEATURE_NAMES;
  return w.names.length === expected.length && w.names.every((n, i) => n === expected[i]);
}

interface Compiled {
  dd: number;
  h: number;
  Wd: Float64Array;
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
