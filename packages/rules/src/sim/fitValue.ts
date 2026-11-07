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
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { evaluate } from "../bot/evaluate.js";
import { extractFeatures, FEATURE_NAMES } from "../bot/features.js";
import { sigmoid, type ValueWeights } from "../bot/valueModel.js";
import { replayMatch, type MatchReplay } from "../replay/matchReplay.js";
import { parseSimExport, samplesFromSimGame, type SimMatchRecord } from "./optcgsim/index.js";
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

export function evalModel(samples: Sample[], w: ValueWeights): { logLoss: number; accuracy: number } {
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

export const DEFAULT_MIN_GAIN = 0.002;
export const DEFAULT_MIN_SAMPLES = 2000;

/** One model scored on the held-out games. `logLoss` is null for weights that cannot be scored (stale feature names). */
export interface ModelScore { names: string[]; logLoss: number | null; accuracy: number | null }

const namesMatch = (names: readonly string[]): boolean => names.length === FEATURE_NAMES.length && names.every((n, i) => n === FEATURE_NAMES[i]);

/** Score the committed weights and a candidate on the same held-out samples. */
export function compareModels(test: Sample[], current: ValueWeights, candidate: ValueWeights): { current: ModelScore; candidate: ModelScore } {
  const score = (w: ValueWeights): ModelScore => {
    if (!namesMatch(w.names)) return { names: w.names, logLoss: null, accuracy: null };
    return { names: w.names, ...evalModel(test, w) };
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
  if (!namesMatch(candidate.names) || candidate.logLoss === null || !Number.isFinite(candidate.logLoss)) return { accept: false, reason: "candidate weights do not match the current feature list" };
  if (opts.heldOutSamples < minSamples) return { accept: false, reason: `only ${opts.heldOutSamples} held-out samples (need ${minSamples})` };
  if (!namesMatch(current.names) || current.logLoss === null) return { accept: true, reason: "committed weights are stale (feature names changed); the refit replaces them" };
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
export function buildDataset(lines: Iterable<string>, opts: { holdout: number; every: number }): { train: Sample[]; test: Sample[]; games: number; skipped: number } {
  const stride = Math.max(2, Math.round(1 / opts.holdout));
  const train: Sample[] = [];
  const test: Sample[] = [];
  let game = 0;
  let skipped = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    const rows = samplesFromReplay(JSON.parse(line) as MatchReplay, game, opts.every);
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
export function buildSimDataset(exports: Iterable<readonly SimMatchRecord[]>, opts: { holdout: number; firstGame: number }): { train: Sample[]; test: Sample[]; games: number; skipped: number } {
  const stride = Math.max(2, Math.round(1 / opts.holdout));
  const train: Sample[] = [];
  const test: Sample[] = [];
  let games = 0;
  let skipped = 0;
  for (const matches of exports) {
    for (const g of parseSimExport(matches).games) {
      const rows = samplesFromSimGame(g, opts.firstGame + games);
      if (!rows.length) skipped += 1;
      (games % stride === stride - 1 ? test : train).push(...rows);
      games += 1;
    }
  }
  return { train, test, games, skipped };
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
  const l2 = Number(arg("l2") ?? 0.01);
  const iters = Number(arg("iters") ?? 3000);
  const every = Number(arg("every-intent") ?? 0);
  const comparePath = arg("compare");
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
  if (cache && existsSync(cache)) {
    ({ train, test, game } = JSON.parse(readFileSync(cache, "utf8")) as { train: Sample[]; test: Sample[]; game: number });
  } else {
    ({ train, test, games: game, skipped } = buildDataset(readLines(files), { holdout, every }));
    if (cache) writeFileSync(cache, JSON.stringify({ train, test, game }));
  }
  const simEntries = (arg("sim") ?? "").split(",").filter(Boolean);
  const replayGames = game;
  if (simEntries.length) {
    // With --cache the replay samples are cached; sim samples are cheap to rebuild and always added after the cache is read.
    const sim = buildSimDataset(expandSimInputs(simEntries).map((f) => JSON.parse(readFileSync(f, "utf8")) as SimMatchRecord[]), { holdout, firstGame: game });
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
  if (simEntries.length) {
    const cmp = comparePath ? (JSON.parse(readFileSync(comparePath, "utf8")) as ValueWeights) : null;
    for (const [label, part] of [["replay games", test.filter((s) => s.game < replayGames)], ["sim games", test.filter((s) => s.game >= replayGames)]] as const) {
      if (!part.length) continue;
      const committed = cmp && namesMatch(cmp.names) ? ` committed ${JSON.stringify(evalModel(part, cmp))}` : "";
      console.log(`held-out ${label}: n=${part.length} learned ${JSON.stringify(evalModel(part, model))}${committed}`);
    }
  }
  if (comparePath) {
    const cur = JSON.parse(readFileSync(comparePath, "utf8")) as ValueWeights;
    const { current, candidate } = compareModels(test, cur, model);
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
  const final: ValueWeights = { ...model, fit: report };
  // Final model: refit on all games (held-out numbers above are from the train-only fit).
  if (gate || process.argv.includes("--refit-all")) Object.assign(final, fitLogistic([...train, ...test], { l2, iters }), { fit: report });
  writeFileSync(out, `${JSON.stringify(final, null, 1)}\n`);
  FEATURE_NAMES.forEach((n, j) => console.log(`  ${n.padEnd(24)} ${final.weights[j]!.toFixed(3)}`));
  console.log(`wrote ${out}`);
}

if (process.argv[1] && /fitValue\.ts$/.test(process.argv[1])) main();
