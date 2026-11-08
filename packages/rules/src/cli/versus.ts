/**
 * Paired bot-vs-bot comparison (#635): bot A against bot B on the meta decks, every pair of games with the same decks,
 * shuffle and first seat and the bots' seats swapped.
 *
 * Usage: npx tsx src/cli/versus.ts --a "kind=hard,evalMode=learned" --b "kind=hard,evalMode=hand" --games 100 --seed 1 --decks meta-decks.json [--procs 3] [--max-evals 14 | --budget-ms 200] [--samples 3] [--json result.json]
 * Spec keys: kind = normal | hard | legacy (an older bot: LEGACY_BOT=<file exporting chooseLegacy>, e.g. a copy of src/bot from git at the commit to compare with), evalMode, prior = meta | true | generic,
 * opp = normal | greedy, mulligan = rule | sim, horizon = 1 | 2, samples, maxEvals, budgetMs,
 * weights = path to a value model JSON (linear or mlp, see bot/valueModel.ts) used for winProb and evalMode=learned instead of the committed valueWeights.json (no commas in the path).
 * Prints wins, win rate with a 95% Wilson interval, the pair counts with the paired interval (versusStats.ts), and CPU time per hard decision for each side.
 * --json writes {games, finished, aWins, rate, ci:[lo,hi], pairs:{aBoth,split,bBoth}, pairedCi:[lo,hi]} (rates are fractions of finished games; pairedCi is for the mean pair score).
 */
import { fork } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { buildDeckPrior, weightsMatchFeatures, type BotLevel, type BotOptions, type ValueModel } from "../bot/index.js";
import { createSeededRng } from "../rng.js";
import type { PlayerDeckConfig } from "../types.js";
import { playBotGame, type Chooser } from "../sim/selfPlay.js";
import { pairedStats, wilson } from "../sim/versusStats.js";

type Spec = Record<string, string>;
const parseSpec = (s: string): Spec => Object.fromEntries(s.split(",").filter(Boolean).map((kv) => kv.split("=") as [string, string]));

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

interface DeckFile { leaderId: string; deck: string[] }
const mix = (a: number, b: number): number => (Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35)) >>> 0;

async function optionsOf(spec: Spec, decks: DeckFile[]): Promise<{ level: BotLevel; opts: Partial<BotOptions>; chooser?: Chooser }> {
  const kind = spec.kind ?? "hard";
  const opts: Partial<BotOptions> = {};
  if (spec.evalMode) opts.evalMode = spec.evalMode as "learned" | "hand";
  if (spec.opp) opts.opponentModel = spec.opp as "normal" | "greedy";
  if (spec.mulligan) opts.mulligan = spec.mulligan as "rule" | "sim";
  if (spec.horizon) opts.horizonTurns = Number(spec.horizon) as 1 | 2;
  if (spec.samples) opts.samples = Number(spec.samples);
  if (spec.maxEvals) opts.maxEvals = Number(spec.maxEvals);
  if (spec.budgetMs) opts.budgetMs = Number(spec.budgetMs);
  if (spec.weights) {
    const model = JSON.parse(readFileSync(spec.weights, "utf8")) as ValueModel;
    if (!weightsMatchFeatures(model)) throw new Error(`${spec.weights}: feature names do not match featureSet ${model.featureSet ?? "v1"}`);
    opts.valueWeights = model;
  }
  if (spec.prior === "true") opts.prior = "true";
  else if (spec.prior === "generic") opts.prior = { lists: { "?": decks.map((d) => d.deck) } };
  else if (spec.prior === "meta") opts.prior = buildDeckPrior(decks);
  if (kind === "legacy") {
    // An older copy of the bot, kept outside the tree: LEGACY_BOT=/path/to/index.js exporting chooseLegacy(state, seat, opts).
    const mod = (await import(process.env.LEGACY_BOT ?? "../legacy632/index.js")) as { chooseLegacy: Chooser };
    return { level: "hard", opts, chooser: mod.chooseLegacy };
  }
  return { level: kind as BotLevel, opts };
}

interface Row { g: number; winner: "a" | "b" | null; turns: number; msA: number; decA: number; msB: number; decB: number; fallbacks: number }

async function worker(): Promise<void> {
  const decks = JSON.parse(readFileSync(arg("decks")!, "utf8")) as DeckFile[];
  const a = await optionsOf(parseSpec(arg("a")!), decks);
  const b = await optionsOf(parseSpec(arg("b")!), decks);
  const [shard, procs] = (arg("shard") ?? "0/1").split("/").map(Number) as [number, number];
  const games = Number(arg("games"));
  const seed = Number(arg("seed"));
  const global: Partial<BotOptions> = {};
  if (arg("max-evals")) { global.maxEvals = Number(arg("max-evals")); global.budgetMs = Infinity; }
  if (arg("budget-ms")) global.budgetMs = Number(arg("budget-ms"));
  if (arg("samples")) global.samples = Number(arg("samples"));
  for (let g = 0; g < games; g += 1) {
    const pair = Math.floor(g / 2);
    if (pair % procs !== shard) continue;
    const s = seed + pair;
    const deckRng = createSeededRng(mix(s, 4));
    const pick = (): PlayerDeckConfig => (({ leaderId, deck }) => ({ leaderId, deck }))(decks[deckRng.nextInt(decks.length)]!);
    const players: [PlayerDeckConfig, PlayerDeckConfig] = [pick(), pick()];
    const aSeat = g % 2 === 0 ? 0 : 1;
    const bots = aSeat === 0 ? [a, b] : [b, a];
    const r = playBotGame({
      seed: s, players, levels: [bots[0]!.level, bots[1]!.level], allOpts: global,
      seatOpts: [bots[0]!.opts, bots[1]!.opts], chooser: [bots[0]!.chooser, bots[1]!.chooser],
    });
    const row: Row = {
      g, winner: r.winner === null ? null : r.winner === aSeat ? "a" : "b", turns: r.turns, fallbacks: r.fallbacks,
      msA: r.lines[aSeat].decisionMs, decA: r.lines[aSeat].decisions, msB: r.lines[1 - aSeat].decisionMs, decB: r.lines[1 - aSeat].decisions,
    };
    process.send?.(row);
  }
}

async function main(): Promise<void> {
  const procs = Number(arg("procs") ?? 3);
  const rows: Row[] = [];
  const t0 = Date.now();
  await Promise.all(Array.from({ length: procs }, (_, i) => new Promise<void>((resolve, reject) => {
    const args = process.argv.slice(2).concat(["--worker", "--shard", `${i}/${procs}`]);
    const child = fork(process.argv[1]!, args, { execArgv: process.execArgv });
    child.on("message", (m) => rows.push(m as Row));
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`worker ${i} exited ${code}`))));
  })));
  const done = rows.filter((r) => r.winner !== null);
  const aw = done.filter((r) => r.winner === "a").length;
  const [lo, hi] = wilson(aw, done.length);
  const pairs = pairedStats(rows);
  const sum = (f: (r: Row) => number): number => rows.reduce((n, r) => n + f(r), 0);
  console.log(`A = ${arg("a")}\nB = ${arg("b")}`);
  console.log(`games ${rows.length}, finished ${done.length}, A wins ${aw} (${((100 * aw) / Math.max(1, done.length)).toFixed(1)}%, 95% CI ${(100 * lo).toFixed(0)}-${(100 * hi).toFixed(0)}%), B wins ${done.length - aw}`);
  console.log(`pairs: A won both ${pairs.aBoth}, split ${pairs.split}, B won both ${pairs.bBoth}; paired score ${(100 * pairs.pairedRate).toFixed(1)}%, 95% CI ${(100 * pairs.pairedCi[0]).toFixed(1)}-${(100 * pairs.pairedCi[1]).toFixed(1)}%`);
  const jsonPath = arg("json");
  if (jsonPath) {
    const result = { games: rows.length, finished: done.length, aWins: aw, rate: done.length ? aw / done.length : 0, ci: [lo, hi], pairs: { aBoth: pairs.aBoth, split: pairs.split, bBoth: pairs.bBoth }, pairedCi: pairs.pairedCi };
    writeFileSync(jsonPath, `${JSON.stringify(result, null, 1)}\n`);
  }
  console.log(`ms per decision: A ${(sum((r) => r.msA) / Math.max(1, sum((r) => r.decA))).toFixed(2)}, B ${(sum((r) => r.msB) / Math.max(1, sum((r) => r.decB))).toFixed(2)}; wall ${((Date.now() - t0) / 1000).toFixed(0)}s, ${(rows.length / ((Date.now() - t0) / 1000)).toFixed(2)} games/s; avg turns ${(sum((r) => r.turns) / rows.length).toFixed(1)}; rejected answers ${sum((r) => r.fallbacks)}`);
}

if (process.argv.includes("--worker")) void worker();
else if (process.argv[1] && /versus\.ts$/.test(process.argv[1])) void main();
