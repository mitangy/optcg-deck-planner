/**
 * Fits the learned value model (#635): logistic regression over bot/features.ts on positions from self-play games.
 *
 * Usage: npx tsx src/sim/fitValue.ts --in a.jsonl,b.jsonl [--out src/bot/valueWeights.json] [--holdout 0.2] [--l2 0.01] [--iters 3000] [--every-intent 0] [--cache samples.json] [--refit-all]
 * Each line of the input is a MatchReplay. Every game is replayed with replayMatch; at the start of every turn the
 * position is sampled from both seats' points of view with label 1 when that seat went on to win. Games without a
 * winner are skipped. Every 1/holdout-th game is held out; the report compares log-loss and accuracy on those games
 * with the hand-tuned evaluate() (squashed with 1/(1+exp(-e/4)), and again after fitting its scale and offset on the training games).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { evaluate } from "../bot/evaluate.js";
import { extractFeatures, FEATURE_NAMES } from "../bot/features.js";
import { sigmoid, type ValueWeights } from "../bot/valueModel.js";
import { replayMatch, type MatchReplay } from "../matchReplay.js";
import type { Seat } from "../types.js";

export interface Sample { x: number[]; y: 0 | 1; hand: number; turn: number; game: number }

/** Positions at every turn start (both seats' views) of one finished replay. */
export function samplesFromReplay(replay: MatchReplay, game: number, everyIntent = 0): Sample[] {
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
    for (const seat of [0, 1] as Seat[]) out.push({ x: extractFeatures(s, seat), y: winner === seat ? 1 : 0, hand: evaluate(s, seat), turn: s.turnNumber, game });
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

function evalModel(samples: Sample[], w: ValueWeights): { logLoss: number; accuracy: number } {
  let ll = 0;
  let ok = 0;
  for (const s of samples) {
    let z = w.bias;
    for (let j = 0; j < s.x.length; j += 1) z += w.weights[j]! * s.x[j]!;
    ll += logLoss(sigmoid(z), s.y);
    if ((z > 0 ? 1 : 0) === s.y) ok += 1;
  }
  return { logLoss: ll / samples.length, accuracy: ok / samples.length };
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

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (process.argv[1] && /fitValue\.ts$/.test(process.argv[1])) {
  const files = (arg("in") ?? "").split(",").filter(Boolean);
  const out = arg("out") ?? "src/bot/valueWeights.json";
  const holdout = Number(arg("holdout") ?? 0.2);
  const l2 = Number(arg("l2") ?? 0.01);
  const iters = Number(arg("iters") ?? 3000);
  const every = Number(arg("every-intent") ?? 0);
  let train: Sample[] = [];
  let test: Sample[] = [];
  let game = 0;
  let skipped = 0;
  const stride = Math.max(2, Math.round(1 / holdout));
  const cache = arg("cache");
  if (cache && existsSync(cache)) {
    ({ train, test, game } = JSON.parse(readFileSync(cache, "utf8")) as { train: Sample[]; test: Sample[]; game: number });
    files.length = 0;
  }
  for (const f of files) {
    for (const line of readFileSync(f, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const replay = JSON.parse(line) as MatchReplay;
      const rows = samplesFromReplay(replay, game, every);
      if (!rows.length) skipped += 1;
      (game % stride === stride - 1 ? test : train).push(...rows);
      game += 1;
    }
  }
  if (cache && !existsSync(cache)) writeFileSync(cache, JSON.stringify({ train, test, game }));
  console.log(`games ${game} (skipped ${skipped}), train samples ${train.length}, held-out samples ${test.length}`);
  const model = fitLogistic(train, { l2, iters });
  const learned = evalModel(test, model);
  const trainFit = evalModel(train, model);
  const raw = handStats(test, (h) => h / 4);
  const cal = calibrateHand(train);
  const calibrated = handStats(test, (h) => cal.a * h + cal.c);
  const base = test.reduce((n, s) => n + s.y, 0) / test.length;
  const prior = handStats(test, () => Math.log(base / (1 - base)));
  const report = { games: game, trainSamples: train.length, heldOutSamples: test.length, learned, trainLearned: trainFit, handTunedRaw: raw, handTunedCalibrated: { ...calibrated, scale: cal.a, offset: cal.c }, constantPrior: prior };
  console.log(JSON.stringify(report, null, 1));
  // Held-out accuracy by turn bucket.
  for (const [lo, hi] of [[1, 4], [5, 8], [9, 12], [13, 99]] as const) {
    const part = test.filter((s) => s.turn >= lo && s.turn <= hi);
    if (!part.length) continue;
    console.log(`turns ${lo}-${hi}: n=${part.length} learned ${JSON.stringify(evalModel(part, model))} hand(cal) ${JSON.stringify(handStats(part, (h) => cal.a * h + cal.c))}`);
  }
  const final: ValueWeights = { ...model, fit: report };
  // Final model: refit on all games (held-out numbers above are from the train-only fit).
  if (process.argv.includes("--refit-all")) Object.assign(final, fitLogistic([...train, ...test], { l2, iters }), { fit: report });
  writeFileSync(out, `${JSON.stringify(final, null, 1)}\n`);
  FEATURE_NAMES.forEach((n, j) => console.log(`  ${n.padEnd(24)} ${final.weights[j]!.toFixed(3)}`));
  console.log(`wrote ${out}`);
}
