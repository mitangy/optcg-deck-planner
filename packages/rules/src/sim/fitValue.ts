/**
 * Fits the learned value model (#635): logistic regression over bot/features.ts on positions from self-play games.
 *
 * Usage: npx tsx src/sim/fitValue.ts --in a.jsonl,dir [--out src/bot/valueWeights.json] [--holdout 0.2] [--l2 0.01] [--iters 3000] [--every-intent 0] [--cache samples.json] [--refit-all]
 *   [--compare current.json] [--gate] [--report report.json] [--min-gain 0.002] [--min-samples 2000] [--sim exports.json,dir]
 * --in entries may be directories (every *.jsonl inside, recursively). --compare scores the committed weights and the new
 * fit on the same held-out games (#915); --gate writes --out only when refitDecision accepts (final model refit on all
 * games) and always writes the --report JSON.
 * --sim adds OPTCGSim exports (#1030): each entry is a Card Kaizoku /matches JSON array (or a directory of *.json). Games are parsed
 * by sim/optcgsim, sampled from the recording player's seat only (samplesFromSimGame) and held out BY GAME with the same stride as
 * replays (game numbers continue after the replays). Held-out numbers are printed for replay games and sim games separately.
 *   npx tsx src/sim/fitValue.ts --in corpus.jsonl --sim ~/optcgsim-matches.json --compare src/bot/valueWeights.json --gate --report r.json
 * Each line of the input is a MatchReplay. Every game is replayed with replayMatch; at the start of every turn the
 * position is sampled from both seats' points of view with label 1 when that seat went on to win. Games without a
 * winner are skipped. Every 1/holdout-th game is held out; the report compares log-loss and accuracy on those games
 * with the hand-tuned evaluate() (squashed with 1/(1+exp(-e/4)), and again after fitting its scale and offset on the training games).
 *
 * Experiments with richer models (the default path above is unchanged and still full-batch):
 *   --features v1|v2     v2 = v1 + leader colours, attack-pressure features and the sparse card bag (bot/features.ts)
 *   --model linear|mlp   mlp = one ReLU hidden layer (--hidden 32). Anything other than v1+linear trains with seeded mini-batch Adam:
 *   --epochs 20 --batch 512 --lr 0.003 --l2 (default 0.01 full batch, 1e-4 mini-batch) --seed 1 --min-card-count 200
 * The v2 card vocabulary is every card that is on a field or in the fitted seat's own hand in at least --min-card-count training positions.
 *   --no-bag             v2 without the card bag: the vocabulary is empty (what the committed model uses; the bag did not help, see HARD_DEFAULTS.evalMode)
 *   --like-compare       take --features, --model, --hidden, --epochs, --batch, --lr, --l2, --seed and --no-bag from the --compare model (its `fit` record),
 *                        so a refit makes the same kind of model as the committed one. A flag given on the command line still wins.
 * --cache stores the samples (with the feature set and, for v2, the card table), so changing model options never replays games again.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { evaluate } from "../bot/evaluate.js";
import { BAG_SLOTS, cardBag, denseFeaturesV2, extractFeatures, FEATURE_NAMES, FEATURE_NAMES_V2 } from "../bot/features.js";
import { featureSetOf, logitOf, logitOfParts, sigmoid, type FeatureSet, type MlpModel, type ValueModel, type ValueWeights } from "../bot/valueModel.js";
import { replayMatch, type MatchReplay } from "../matchReplay.js";
import { parseSimExport, samplesFromSimGame, type SimMatchRecord } from "./optcgsim/index.js";
import type { Seat } from "../types.js";

export interface Sample {
  x: number[];
  y: 0 | 1;
  hand: number;
  turn: number;
  game: number;
  /** v2 only: the sparse card bag as flat [slotKey, value, ...] pairs; slotKey = 2 * (index in the corpus CardTable) + slot. */
  sp?: number[];
}

/** Every card id seen while building samples, in first-seen order (the v2 bag refers to cards by index here). */
export class CardTable {
  ids: string[] = [];
  private index = new Map<string, number>();
  lookup = (defId: string): number => {
    let i = this.index.get(defId);
    if (i === undefined) { i = this.ids.length; this.ids.push(defId); this.index.set(defId, i); }
    return i;
  };
  static from(ids: string[]): CardTable { const t = new CardTable(); for (const id of ids) t.lookup(id); return t; }
}

/** Positions at every turn start (both seats' views) of one finished replay. */
export function samplesFromReplay(replay: MatchReplay, game: number, everyIntent = 0, featureSet: FeatureSet = "v1", table?: CardTable): Sample[] {
  if (featureSet === "v2" && !table) throw new Error("feature set v2 needs a CardTable");
  const winner = replay.end?.winner;
  if (winner === undefined) return [];
  const out: Sample[] = [];
  let lastTurn = -1;
  let n = 0;
  replayMatch(replay, (step) => {
    n += 1;
    const s = step.state;
    if (s.winner !== null || s.phase === "mulligan") return;
    const newTurn = s.turnNumber !== lastTurn;
    lastTurn = s.turnNumber;
    if (!newTurn && !(everyIntent > 0 && n % everyIntent === 0)) return;
    for (const seat of [0, 1] as Seat[]) {
      const row: Sample = { x: featureSet === "v2" ? denseFeaturesV2(s, seat) : extractFeatures(s, seat), y: winner === seat ? 1 : 0, hand: evaluate(s, seat), turn: s.turnNumber, game };
      if (featureSet === "v2") {
        const bag = cardBag(s, seat, table!.lookup);
        row.sp = bag.idx.flatMap((k, i) => [k, bag.val[i]!]);
      }
      out.push(row);
    }
  });
  return out;
}

const logLoss = (p: number, y: number): number => -(y ? Math.log(Math.max(1e-9, p)) : Math.log(Math.max(1e-9, 1 - p)));

export function fitLogistic(train: Sample[], opts: { l2: number; iters: number; /** Features the penalty does not touch (default hand_eval: the fit starts from the hand-tuned score and corrects it). */ free?: string[] }): ValueWeights {
  const free = new Set(opts.free ?? ["hand_eval"]);
  const d = FEATURE_NAMES.length;
  const mean = new Array<number>(d).fill(0);
  const std = new Array<number>(d).fill(0);
  for (const s of train) for (let j = 0; j < d; j += 1) mean[j]! += s.x[j]! / train.length;
  for (const s of train) for (let j = 0; j < d; j += 1) std[j]! += (s.x[j]! - mean[j]!) ** 2 / train.length;
  for (let j = 0; j < d; j += 1) std[j] = Math.sqrt(std[j]!) || 1;
  const X = train.map((s) => s.x.map((v, j) => (v - mean[j]!) / std[j]!));
  const w = new Array<number>(d).fill(0);
  let b = 0;
  const m = new Array<number>(d + 1).fill(0);
  const v = new Array<number>(d + 1).fill(0);
  const lr = 0.03;
  for (let t = 1; t <= opts.iters; t += 1) {
    const g = new Array<number>(d + 1).fill(0);
    for (let i = 0; i < X.length; i += 1) {
      let z = b;
      const xi = X[i]!;
      for (let j = 0; j < d; j += 1) z += w[j]! * xi[j]!;
      const err = sigmoid(z) - train[i]!.y;
      for (let j = 0; j < d; j += 1) g[j]! += err * xi[j]!;
      g[d]! += err;
    }
    for (let j = 0; j <= d; j += 1) {
      const grad = g[j]! / X.length + (j < d && !free.has(FEATURE_NAMES[j]!) ? opts.l2 * w[j]! : 0);
      m[j] = 0.9 * m[j]! + 0.1 * grad;
      v[j] = 0.999 * v[j]! + 0.001 * grad * grad;
      const step = (lr * (m[j]! / (1 - 0.9 ** t))) / (Math.sqrt(v[j]! / (1 - 0.999 ** t)) + 1e-8);
      if (j < d) w[j]! -= step; else b -= step;
    }
  }
  // Back to raw feature space.
  const raw = w.map((wj, j) => wj / std[j]!);
  const bias = b - w.reduce((n, wj, j) => n + (wj * mean[j]!) / std[j]!, 0);
  return { names: [...FEATURE_NAMES], weights: raw, bias };
}

/** A v2 vocabulary seen from a CardTable: table index -> vocab index (-1 = not in the vocabulary). */
function vocabMap(table: CardTable, vocab: readonly string[]): Int32Array {
  const at = new Map(vocab.map((id, i) => [id, i]));
  return Int32Array.from(table.ids, (id) => at.get(id) ?? -1);
}

/** A sample's bag in vocabulary slots (parallel idx / val arrays). */
function bagOf(sp: readonly number[] | undefined, toVocab: Int32Array | null): { idx: number[]; val: number[] } {
  const idx: number[] = [];
  const val: number[] = [];
  if (sp && toVocab) {
    for (let k = 0; k < sp.length; k += 2) {
      const v = toVocab[Math.floor(sp[k]! / BAG_SLOTS)]!;
      if (v >= 0) { idx.push(v * BAG_SLOTS + (sp[k]! % BAG_SLOTS)); val.push(sp[k + 1]!); }
    }
  }
  return { idx, val };
}

/** Log-loss and accuracy, through the same inference code the bot runs (a fit that disagrees with it shows up here). `table` is needed for v2 models. */
export function evalModel(samples: Sample[], w: ValueModel, table?: CardTable): { logLoss: number; accuracy: number } {
  const toVocab = table && w.vocab ? vocabMap(table, w.vocab) : null;
  const plain = w.kind !== "mlp" && !toVocab;
  let ll = 0;
  let ok = 0;
  for (const s of samples) {
    let z: number;
    if (plain) z = logitOf(s.x, w);
    else { const b = bagOf(s.sp, toVocab); z = logitOfParts(w, s.x, b.idx, b.val); }
    ll += logLoss(sigmoid(z), s.y);
    if ((z > 0 ? 1 : 0) === s.y) ok += 1;
  }
  return { logLoss: ll / samples.length, accuracy: ok / samples.length };
}

// --- mini-batch fits (v2 features and / or the MLP) ---------------------------------------------------------------

export interface BatchFitOptions {
  model: "linear" | "mlp";
  featureSet: FeatureSet;
  hidden: number;
  epochs: number;
  batch: number;
  lr: number;
  l2: number;
  seed: number;
  minCardCount: number;
  /** v2 only: false = no card bag (empty vocabulary), whatever minCardCount is. Default true. */
  bag?: boolean;
  /** Held-out positions to report on while training. */
  monitor?: Sample[];
  log?: (line: string) => void;
}

/** Cards that appear (nonzero in any bag slot) in at least `minCount` of the positions, most frequent first. */
export function buildVocab(samples: Sample[], table: CardTable, minCount: number): string[] {
  const counts = new Int32Array(table.ids.length);
  for (const s of samples) {
    const sp = s.sp;
    if (!sp) continue;
    // A card can fill both of its slots; it still counts once per position.
    const seen = new Set<number>();
    for (let k = 0; k < sp.length; k += 2) {
      const card = Math.floor(sp[k]! / BAG_SLOTS);
      if (!seen.has(card)) { seen.add(card); counts[card]! += 1; }
    }
  }
  return table.ids.map((id, i) => ({ id, n: counts[i]! })).filter((c) => c.n >= minCount).sort((a, b) => b.n - a.n || a.id.localeCompare(b.id)).map((c) => c.id);
}

function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Seeded mini-batch Adam on log-loss for a linear or one-hidden-layer ReLU model over the dense features (standardised on
 * `train`) plus the sparse card bag (not standardised: it would stop being sparse). The bag is dotted sparsely both ways.
 * A linear result is folded back to raw feature space like fitLogistic's; an MLP keeps mean/std inside the model.
 */
export function fitBatched(train: Sample[], table: CardTable | undefined, o: BatchFitOptions): ValueModel {
  const names: string[] = o.featureSet === "v2" ? [...FEATURE_NAMES_V2] : [...FEATURE_NAMES];
  const dd = names.length;
  const vocab = o.featureSet === "v2" ? (o.bag === false ? [] : buildVocab(train, table!, o.minCardCount)) : undefined;
  const ns = (vocab?.length ?? 0) * BAG_SLOTS;
  const toVocab = vocab && table ? vocabMap(table, vocab) : null;
  const n = train.length;
  const mlp = o.model === "mlp";
  const h = mlp ? o.hidden : 0;
  const log = o.log ?? (() => undefined);
  log(`fit ${o.model} on ${o.featureSet}: ${n} positions, ${dd} dense inputs, ${vocab ? `${vocab.length} cards in the bag (${ns} slots)` : "no bag"}${mlp ? `, ${h} hidden units` : ""}`);

  // Standardise the dense inputs on the training positions.
  const mean = new Array<number>(dd).fill(0);
  const std = new Array<number>(dd).fill(0);
  for (const s of train) for (let j = 0; j < dd; j += 1) mean[j]! += s.x[j]! / n;
  for (const s of train) for (let j = 0; j < dd; j += 1) std[j]! += (s.x[j]! - mean[j]!) ** 2 / n;
  for (let j = 0; j < dd; j += 1) std[j] = Math.sqrt(std[j]!) || 1;
  const X = new Float64Array(n * dd);
  const Y = new Float64Array(n);
  const rowStart = new Int32Array(n + 1);
  const bagIdx: number[] = [];
  const bagVal: number[] = [];
  train.forEach((s, i) => {
    for (let j = 0; j < dd; j += 1) X[i * dd + j] = (s.x[j]! - mean[j]!) / std[j]!;
    Y[i] = s.y;
    const b = bagOf(s.sp, toVocab);
    for (let k = 0; k < b.idx.length; k += 1) { bagIdx.push(b.idx[k]!); bagVal.push(b.val[k]!); }
    rowStart[i + 1] = bagIdx.length;
  });
  const SI = Int32Array.from(bagIdx);
  const SV = Float64Array.from(bagVal);

  // One flat parameter vector (and gradient, Adam moments, L2 multipliers) with named views.
  const nW = mlp ? h * dd : dd;
  const nS = mlp ? ns * h : ns;
  const nB1 = mlp ? h : 0;
  const nW2 = mlp ? h : 0;
  const total = nW + nS + nB1 + nW2 + 1;
  const P = new Float64Array(total);
  const G = new Float64Array(total);
  const M = new Float64Array(total);
  const V = new Float64Array(total);
  const reg = new Float64Array(total);
  const view = (a: Float64Array, from: number, len: number) => a.subarray(from, from + len);
  const oW = 0; const oS = nW; const oB1 = nW + nS; const oW2 = oB1 + nB1; const oB = oW2 + nW2;
  const W = view(P, oW, nW); const S = view(P, oS, nS); const B1 = view(P, oB1, nB1); const W2 = view(P, oW2, nW2);
  const gW = view(G, oW, nW); const gS = view(G, oS, nS); const gB1 = view(G, oB1, nB1); const gW2 = view(G, oW2, nW2);
  reg.fill(o.l2, 0, oB1);
  reg.fill(o.l2, oW2, oB);
  if (!mlp) { const free = FEATURE_NAMES.indexOf("hand_eval"); if (free >= 0) reg[oW + free] = 0; }

  const rand = seededRandom(o.seed);
  const gauss = (): number => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  if (mlp) {
    for (let i = 0; i < nW; i += 1) W[i] = gauss() * Math.sqrt(2 / dd);
    for (let i = 0; i < nS; i += 1) S[i] = gauss() * 0.05;
    for (let i = 0; i < nW2; i += 1) W2[i] = gauss() / Math.sqrt(h);
  }

  const snapshot = (): ValueModel => {
    if (mlp) {
      const W1 = Array.from({ length: h }, (_, j) => {
        const row = Array.from(W.subarray(j * dd, (j + 1) * dd));
        for (let k = 0; k < ns; k += 1) row.push(S[k * h + j]!);
        return row;
      });
      const m: MlpModel = { kind: "mlp", featureSet: o.featureSet, names, mean: [...mean], std: [...std], hidden: { W1, b1: Array.from(B1), w2: Array.from(W2), b2: P[oB]! } };
      if (vocab) m.vocab = vocab;
      return m;
    }
    const m: ValueWeights = {
      names,
      weights: Array.from(W, (w, j) => w / std[j]!),
      bias: P[oB]! - Array.from(W).reduce((acc, w, j) => acc + (w * mean[j]!) / std[j]!, 0),
    };
    if (o.featureSet === "v2") { m.featureSet = "v2"; m.vocab = vocab; m.bagWeights = Array.from(S); }
    return m;
  };

  const act = new Float64Array(Math.max(1, h));
  const order = Int32Array.from({ length: n }, (_, i) => i);
  const t0 = Date.now();
  let step = 0;
  for (let epoch = 0; epoch < o.epochs; epoch += 1) {
    for (let i = n - 1; i > 0; i -= 1) { const k = Math.floor(rand() * (i + 1)); const t = order[i]!; order[i] = order[k]!; order[k] = t; }
    const lr = o.lr * (1 - (0.9 * epoch) / Math.max(1, o.epochs));
    let epochLoss = 0;
    for (let start = 0; start < n; start += o.batch) {
      const end = Math.min(n, start + o.batch);
      G.fill(0);
      for (let q = start; q < end; q += 1) {
        const i = order[q]!;
        const xo = i * dd;
        const s0 = rowStart[i]!;
        const s1 = rowStart[i + 1]!;
        let z: number;
        if (mlp) {
          z = P[oB]!;
          for (let j = 0; j < h; j += 1) {
            let a = B1[j]!;
            const row = j * dd;
            for (let f = 0; f < dd; f += 1) a += W[row + f]! * X[xo + f]!;
            act[j] = a;
          }
          for (let k = s0; k < s1; k += 1) { const base = SI[k]! * h; const v = SV[k]!; for (let j = 0; j < h; j += 1) act[j]! += S[base + j]! * v; }
          for (let j = 0; j < h; j += 1) if (act[j]! > 0) z += W2[j]! * act[j]!;
        } else {
          z = P[oB]!;
          for (let f = 0; f < dd; f += 1) z += W[f]! * X[xo + f]!;
          for (let k = s0; k < s1; k += 1) z += S[SI[k]!]! * SV[k]!;
        }
        const p = sigmoid(z);
        const y = Y[i]!;
        epochLoss += logLoss(p, y);
        const err = p - y;
        G[oB]! += err;
        if (mlp) {
          for (let j = 0; j < h; j += 1) {
            const a = act[j]!;
            if (a <= 0) continue;
            gW2[j]! += err * a;
            const da = err * W2[j]!;
            gB1[j]! += da;
            const row = j * dd;
            for (let f = 0; f < dd; f += 1) gW[row + f]! += da * X[xo + f]!;
            for (let k = s0; k < s1; k += 1) gS[SI[k]! * h + j]! += da * SV[k]!;
          }
        } else {
          for (let f = 0; f < dd; f += 1) gW[f]! += err * X[xo + f]!;
          for (let k = s0; k < s1; k += 1) gS[SI[k]!]! += err * SV[k]!;
        }
      }
      step += 1;
      const scale = 1 / (end - start);
      const c1 = 1 - 0.9 ** step;
      const c2 = 1 - 0.999 ** step;
      for (let k = 0; k < total; k += 1) {
        const grad = G[k]! * scale + reg[k]! * P[k]!;
        M[k] = 0.9 * M[k]! + 0.1 * grad;
        V[k] = 0.999 * V[k]! + 0.001 * grad * grad;
        P[k]! -= (lr * (M[k]! / c1)) / (Math.sqrt(V[k]! / c2) + 1e-8);
      }
    }
    if (o.monitor?.length && (epoch === 0 || (epoch + 1) % Math.max(1, Math.round(o.epochs / 8)) === 0 || epoch === o.epochs - 1)) {
      const ho = evalModel(o.monitor, snapshot(), table);
      log(`  epoch ${String(epoch + 1).padStart(3)}  train loss ${(epochLoss / n).toFixed(4)}  held-out loss ${ho.logLoss.toFixed(4)} acc ${ho.accuracy.toFixed(4)}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  }
  return snapshot();
}

/** Fit p = sigmoid(a * hand + c) on `train` (the hand-tuned evaluator, recalibrated), a fair baseline. */
function calibrateHand(train: Sample[]): { a: number; c: number } {
  let a = 0.25;
  let c = 0;
  for (let t = 0; t < 400; t += 1) {
    let ga = 0;
    let gc = 0;
    for (const s of train) { const e = sigmoid(a * s.hand + c) - s.y; ga += e * s.hand; gc += e; }
    a -= (0.5 * ga) / train.length / 20;
    c -= (0.5 * gc) / train.length;
  }
  return { a, c };
}

function handStats(samples: Sample[], f: (h: number) => number): { logLoss: number; accuracy: number } {
  let ll = 0;
  let ok = 0;
  for (const s of samples) { const p = sigmoid(f(s.hand)); ll += logLoss(p, s.y); if ((p > 0.5 ? 1 : 0) === s.y) ok += 1; }
  return { logLoss: ll / samples.length, accuracy: ok / samples.length };
}

export const DEFAULT_MIN_GAIN = 0.002;
export const DEFAULT_MIN_SAMPLES = 2000;

/** One model scored on the held-out games. `logLoss` is null for weights that cannot be scored (stale feature names). */
export interface ModelScore { names: string[]; logLoss: number | null; accuracy: number | null; /** Present (as "v2") only for non-v1 models. */ featureSet?: FeatureSet }

/** Whether `names` is the current feature list of `featureSet`. */
const namesMatch = (names: readonly string[], featureSet: FeatureSet = "v1"): boolean => {
  const expected = featureSet === "v2" ? FEATURE_NAMES_V2 : FEATURE_NAMES;
  return names.length === expected.length && names.every((n, i) => n === expected[i]);
};

/** Score the committed weights and a candidate on the same held-out samples. */
export function compareModels(test: Sample[], current: ValueModel, candidate: ValueModel, table?: CardTable): { current: ModelScore; candidate: ModelScore } {
  const score = (w: ValueModel): ModelScore => {
    const fs = featureSetOf(w);
    const tag = fs === "v1" ? {} : { featureSet: fs };
    if (!namesMatch(w.names, fs)) return { names: w.names, ...tag, logLoss: null, accuracy: null };
    return { names: w.names, ...tag, ...evalModel(test, w, table) };
  };
  return { current: score(current), candidate: score(candidate) };
}

/**
 * Whether a candidate refit should replace the committed weights (#915). Never on too few held-out samples or a
 * candidate that does not match FEATURE_NAMES; otherwise when the current weights are stale or the candidate's
 * held-out log-loss beats theirs by at least `minGain`.
 */
export function refitDecision(current: ModelScore, candidate: ModelScore, opts: { heldOutSamples: number; minGain?: number; minSamples?: number }): { accept: boolean; reason: string } {
  const minGain = opts.minGain ?? DEFAULT_MIN_GAIN;
  const minSamples = opts.minSamples ?? DEFAULT_MIN_SAMPLES;
  if (!namesMatch(candidate.names, candidate.featureSet) || candidate.logLoss === null || !Number.isFinite(candidate.logLoss)) return { accept: false, reason: "candidate weights do not match the current feature list" };
  if (opts.heldOutSamples < minSamples) return { accept: false, reason: `only ${opts.heldOutSamples} held-out samples (need ${minSamples})` };
  if (!namesMatch(current.names, current.featureSet) || current.logLoss === null) return { accept: true, reason: "committed weights are stale (feature names changed); the refit replaces them" };
  const gain = current.logLoss - candidate.logLoss;
  if (gain >= minGain) return { accept: true, reason: `held-out log-loss improves by ${gain.toFixed(4)} (${current.logLoss.toFixed(4)} -> ${candidate.logLoss.toFixed(4)})` };
  return { accept: false, reason: `held-out log-loss gain ${gain.toFixed(4)} is below ${minGain} (${current.logLoss.toFixed(4)} -> ${candidate.logLoss.toFixed(4)})` };
}

/** Expand `--in` entries: files stay, directories become every *.jsonl inside (recursively, sorted). */
export function expandInputs(entries: string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".jsonl")) out.push(p);
    }
  };
  for (const e of entries) { if (statSync(e).isDirectory()) walk(e); else out.push(e); }
  return out;
}

/** Split replays (JSONL lines) into train and held-out samples; every stride-th game, by game, is held out. */
export function buildDataset(lines: Iterable<string>, opts: { holdout: number; every: number; featureSet?: FeatureSet; table?: CardTable }): { train: Sample[]; test: Sample[]; games: number; skipped: number } {
  const stride = Math.max(2, Math.round(1 / opts.holdout));
  const train: Sample[] = [];
  const test: Sample[] = [];
  let game = 0;
  let skipped = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    // A replay recorded on an older engine can diverge after a card fix; it is skipped like a game without a winner.
    let rows: Sample[];
    try { rows = samplesFromReplay(JSON.parse(line) as MatchReplay, game, opts.every, opts.featureSet, opts.table); } catch { rows = []; }
    if (!rows.length) skipped += 1;
    (game % stride === stride - 1 ? test : train).push(...rows);
    game += 1;
  }
  return { train, test, games: game, skipped };
}

/** Expand `--sim` entries: files stay, directories become every *.json inside (recursively, sorted). */
export function expandSimInputs(entries: string[]): string[] {
  return entries.flatMap((e) => (statSync(e).isDirectory() ? readdirSync(e, { recursive: true, encoding: "utf8" }).filter((n) => n.endsWith(".json")).sort().map((n) => join(e, n)) : [e]));
}

/**
 * Samples of parsed sim exports split into train and held-out BY GAME (every stride-th game is held out), numbering games
 * from `firstGame` so they never collide with replay games. Games with no winner or an unknown card id yield no rows and count as skipped.
 */
export function buildSimDataset(exports: Iterable<readonly SimMatchRecord[]>, opts: { holdout: number; firstGame: number; featureSet?: FeatureSet; table?: CardTable }): { train: Sample[]; test: Sample[]; games: number; skipped: number } {
  const stride = Math.max(2, Math.round(1 / opts.holdout));
  const train: Sample[] = [];
  const test: Sample[] = [];
  let games = 0;
  let skipped = 0;
  for (const matches of exports) {
    for (const g of parseSimExport(matches).games) {
      const rows = samplesFromSimGame(g, opts.firstGame + games, opts.featureSet, opts.table);
      if (!rows.length) skipped += 1;
      (games % stride === stride - 1 ? test : train).push(...rows);
      games += 1;
    }
  }
  return { train, test, games, skipped };
}

/**
 * The fit options that reproduce `model` (--like-compare): flag name -> value, from the model's own fields and the `fit` record
 * written by a refit. A model without such a record (the old linear v1 file) is the plain `--features v1 --model linear` fit.
 */
export function likeOptions(model: ValueModel): { values: Record<string, string>; noBag: boolean } {
  const values: Record<string, string> = { features: featureSetOf(model), model: model.kind === "mlp" ? "mlp" : "linear" };
  const fit = (model.fit ?? {}) as Record<string, unknown>;
  for (const key of ["hidden", "epochs", "batch", "lr", "l2", "seed"]) {
    if (typeof fit[key] === "number") values[key] = String(fit[key]);
  }
  return { values, noBag: featureSetOf(model) === "v2" && (model.vocab?.length ?? 0) === 0 };
}

/** The model-shaping command-line options of a fit, with the --like-compare model's values as defaults (`compare` is that model, or null). */
export function fitFlags(argv: string[], compare: ValueModel | null) {
  const get = (name: string): string | undefined => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
  const like = compare ? likeOptions(compare) : { values: {} as Record<string, string>, noBag: false };
  /** A command-line flag, else the --compare model's value under --like-compare. */
  const opt = (name: string): string | undefined => get(name) ?? like.values[name];
  const featureSet = (opt("features") ?? "v1") as FeatureSet;
  const kind = (opt("model") ?? "linear") as "linear" | "mlp";
  if (featureSet !== "v1" && featureSet !== "v2") throw new Error(`--features must be v1 or v2, got ${featureSet}`);
  if (kind !== "linear" && kind !== "mlp") throw new Error(`--model must be linear or mlp, got ${kind}`);
  const noBag = argv.includes("--no-bag") || like.noBag;
  if (noBag && featureSet !== "v2") throw new Error("--no-bag only applies to --features v2");
  const classic = featureSet === "v1" && kind === "linear";
  return {
    featureSet, kind, noBag, classic,
    l2: Number(opt("l2") ?? (classic ? 0.01 : 1e-4)),
    hidden: Number(opt("hidden") ?? 32), epochs: Number(opt("epochs") ?? 20), batch: Number(opt("batch") ?? 512),
    lr: Number(opt("lr") ?? 0.003), seed: Number(opt("seed") ?? 1),
  };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function* readLines(files: string[]): Generator<string> {
  for (const f of files) yield* readFileSync(f, "utf8").split("\n");
}

function main(): void {
  const files = expandInputs((arg("in") ?? "").split(",").filter(Boolean));
  const out = arg("out") ?? "src/bot/valueWeights.json";
  const holdout = Number(arg("holdout") ?? 0.2);
  const comparePath = arg("compare");
  const flags = fitFlags(process.argv, comparePath && process.argv.includes("--like-compare") ? (JSON.parse(readFileSync(comparePath, "utf8")) as ValueModel) : null);
  const { featureSet, kind, noBag, l2, classic } = flags;
  const iters = Number(arg("iters") ?? 3000);
  const every = Number(arg("every-intent") ?? 0);
  const gate = process.argv.includes("--gate");
  const reportPath = arg("report");
  const minGain = Number(arg("min-gain") ?? DEFAULT_MIN_GAIN);
  const minSamples = Number(arg("min-samples") ?? DEFAULT_MIN_SAMPLES);
  if (gate && !comparePath) throw new Error("--gate needs --compare");
  const writeReport = (r: object): void => { if (reportPath) writeFileSync(reportPath, `${JSON.stringify(r, null, 1)}\n`); };
  let train: Sample[] = [];
  let test: Sample[] = [];
  let game = 0;
  let skipped = 0;
  const cache = arg("cache");
  const table = new CardTable();
  if (cache && existsSync(cache)) {
    const c = JSON.parse(readFileSync(cache, "utf8")) as { featureSet?: FeatureSet; cards?: string[]; train: Sample[]; test: Sample[]; game: number };
    if ((c.featureSet ?? "v1") !== featureSet) throw new Error(`${cache} holds ${c.featureSet ?? "v1"} samples, but --features is ${featureSet}`);
    ({ train, test, game } = c);
    for (const id of c.cards ?? []) table.lookup(id);
  } else {
    ({ train, test, games: game, skipped } = buildDataset(readLines(files), { holdout, every, featureSet, table }));
    if (cache) writeFileSync(cache, JSON.stringify(featureSet === "v1" ? { train, test, game } : { featureSet, cards: table.ids, train, test, game }));
  }
  const simEntries = (arg("sim") ?? "").split(",").filter(Boolean);
  const replayGames = game;
  if (simEntries.length) {
    // With --cache the replay samples are cached; sim samples are cheap to rebuild and always added after the cache is read.
    const sim = buildSimDataset(expandSimInputs(simEntries).map((f) => JSON.parse(readFileSync(f, "utf8")) as SimMatchRecord[]), { holdout, firstGame: game, featureSet, table });
    train = [...train, ...sim.train];
    test = [...test, ...sim.test];
    game += sim.games;
    skipped += sim.skipped;
    console.log(`sim games ${sim.games} (skipped ${sim.skipped}): train samples ${sim.train.length}, held-out samples ${sim.test.length}`);
  }
  console.log(`games ${game} (skipped ${skipped}), train samples ${train.length}, held-out samples ${test.length}`);
  if (!train.length || !test.length) {
    const reason = "no usable train or held-out samples";
    writeReport({ games: game, trainSamples: train.length, heldOutSamples: test.length, accept: false, reason });
    if (gate) { console.log(`REJECT: ${reason}`); return; }
    throw new Error(reason);
  }
  const batched: BatchFitOptions = {
    model: kind, featureSet, hidden: flags.hidden, epochs: flags.epochs, batch: flags.batch,
    lr: flags.lr, l2, seed: flags.seed, minCardCount: Number(arg("min-card-count") ?? 200), bag: !noBag,
    monitor: test, log: console.log,
  };
  const fit = (rows: Sample[]): ValueModel => (classic ? fitLogistic(rows, { l2, iters }) : fitBatched(rows, table, batched));
  const model = fit(train);
  const learned = evalModel(test, model, table);
  const trainFit = evalModel(train, model, table);
  const raw = handStats(test, (h) => h / 4);
  const cal = calibrateHand(train);
  const calibrated = handStats(test, (h) => cal.a * h + cal.c);
  const base = test.reduce((n, s) => n + s.y, 0) / test.length;
  const prior = handStats(test, () => Math.log(base / (1 - base)));
  const config = classic ? {} : { featureSet, model: kind, hidden: kind === "mlp" ? batched.hidden : undefined, epochs: batched.epochs, batch: batched.batch, lr: batched.lr, l2, seed: batched.seed, vocab: model.vocab?.length ?? 0 };
  const report = { ...config, games: game, trainSamples: train.length, heldOutSamples: test.length, learned, trainLearned: trainFit, handTunedRaw: raw, handTunedCalibrated: { ...calibrated, scale: cal.a, offset: cal.c }, constantPrior: prior };
  console.log(JSON.stringify(report, null, 1));
  // Held-out accuracy by turn bucket.
  for (const [lo, hi] of [[1, 4], [5, 8], [9, 12], [13, 99]] as const) {
    const part = test.filter((s) => s.turn >= lo && s.turn <= hi);
    if (!part.length) continue;
    console.log(`turns ${lo}-${hi}: n=${part.length} learned ${JSON.stringify(evalModel(part, model, table))} hand(cal) ${JSON.stringify(handStats(part, (h) => cal.a * h + cal.c))}`);
  }
  if (simEntries.length) {
    const cmp = comparePath ? (JSON.parse(readFileSync(comparePath, "utf8")) as ValueModel) : null;
    for (const [label, part] of [["replay games", test.filter((s) => s.game < replayGames)], ["sim games", test.filter((s) => s.game >= replayGames)]] as const) {
      if (!part.length) continue;
      const committed = cmp && namesMatch(cmp.names, featureSetOf(cmp)) ? ` committed ${JSON.stringify(evalModel(part, cmp, table))}` : "";
      console.log(`held-out ${label}: n=${part.length} learned ${JSON.stringify(evalModel(part, model, table))}${committed}`);
    }
  }
  if (comparePath) {
    const cur = JSON.parse(readFileSync(comparePath, "utf8")) as ValueModel;
    const { current, candidate } = compareModels(test, cur, model, table);
    const decision = refitDecision(current, candidate, { heldOutSamples: test.length, minGain, minSamples });
    console.log(`current   ${current.logLoss === null ? "stale (feature names differ)" : JSON.stringify({ logLoss: current.logLoss, accuracy: current.accuracy })}`);
    console.log(`candidate ${JSON.stringify({ logLoss: candidate.logLoss, accuracy: candidate.accuracy })}`);
    console.log(`${decision.accept ? "ACCEPT" : "REJECT"}: ${decision.reason}`);
    writeReport({
      games: game, trainSamples: train.length, heldOutSamples: test.length,
      current: { logLoss: current.logLoss, accuracy: current.accuracy, stale: current.logLoss === null },
      candidate: { logLoss: candidate.logLoss, accuracy: candidate.accuracy },
      minGain, minSamples, accept: decision.accept, reason: decision.reason,
    });
    if (gate && !decision.accept) { console.log(`not writing ${out}`); return; }
  }
  const final: ValueModel = { ...model, fit: report };
  // Final model: refit on all games (held-out numbers above are from the train-only fit).
  if (gate || process.argv.includes("--refit-all")) Object.assign(final, fit([...train, ...test]), { fit: report });
  writeFileSync(out, `${JSON.stringify(final, null, 1)}\n`);
  if (final.kind !== "mlp") final.names.forEach((n, j) => console.log(`  ${n.padEnd(24)} ${final.weights[j]!.toFixed(3)}`));
  if (final.kind !== "mlp" && final.vocab && final.bagWeights) {
    const slots = final.bagWeights.map((w, k) => ({ w, name: `${final.vocab![k >> 1]} ${k & 1 ? "hand" : "field_diff"}` })).sort((a, b) => Math.abs(b.w) - Math.abs(a.w)).slice(0, 15);
    for (const s of slots) console.log(`  ${s.name.padEnd(30)} ${s.w.toFixed(3)}`);
  }
  console.log(`wrote ${out}`);
}

if (process.argv[1] && /fitValue\.ts$/.test(process.argv[1])) main();
