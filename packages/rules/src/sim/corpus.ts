/**
 * Self-play corpus for Log Pose (#635): hard-vs-hard games on a decks file, one MatchReplay per line of <out>.jsonl and,
 * keyed by the same line index, one tally per game in <out>.tallies.jsonl ({ index, seed, decks, winner, turns, intents, stoppedEarly, fallbacks, lines }).
 * The replay lines stay pure MatchReplays.
 *
 * Usage: npx tsx src/sim/corpus.ts --games 300 --seed 9000 --decks meta-decks.json --out corpus-v2 [--procs 3] [--budget-ms 1500] [--samples 5]
 */
import { fork } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import type { MatchReplay } from "../matchReplay.js";
import { createSeededRng } from "../rng.js";
import type { PlayerDeckConfig } from "../types.js";
import { playBotGame, type BotGameResult } from "./selfPlay.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
interface DeckFile { name?: string; leaderId: string; deck: string[] }
const mix = (a: number, b: number): number => (Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35)) >>> 0;

interface Row { index: number; replay: MatchReplay; tally: Omit<BotGameResult, "replay"> & { seed: number; decks: [string, string] } }

function worker(): void {
  const decks = JSON.parse(readFileSync(arg("decks")!, "utf8")) as DeckFile[];
  const [shard, procs] = (arg("shard") ?? "0/1").split("/").map(Number) as [number, number];
  const games = Number(arg("games"));
  const seed0 = Number(arg("seed"));
  const budgetMs = arg("budget-ms") !== undefined ? Number(arg("budget-ms")) : undefined;
  const samples = arg("samples") !== undefined ? Number(arg("samples")) : undefined;
  for (let g = shard; g < games; g += procs) {
    const seed = seed0 + g;
    const deckRng = createSeededRng(mix(seed, 4));
    const pick = (): PlayerDeckConfig => (({ leaderId, deck }) => ({ leaderId, deck }))(decks[deckRng.nextInt(decks.length)]!);
    const players: [PlayerDeckConfig, PlayerDeckConfig] = [pick(), pick()];
    const r = playBotGame({ seed, players, levels: ["hard", "hard"], ...(budgetMs !== undefined ? { budgetMs } : {}), ...(samples !== undefined ? { samples } : {}) });
    const { replay, ...rest } = r;
    process.send?.({ index: g, replay, tally: { ...rest, seed, decks: [players[0].leaderId, players[1].leaderId] } } satisfies Row);
  }
}

async function main(): Promise<void> {
  const procs = Number(arg("procs") ?? 3);
  const out = arg("out") ?? "corpus";
  const rows: Row[] = [];
  await Promise.all(Array.from({ length: procs }, (_, i) => new Promise<void>((resolve, reject) => {
    const child = fork(process.argv[1]!, process.argv.slice(2).concat(["--worker", "--shard", `${i}/${procs}`]), { execArgv: process.execArgv });
    child.on("message", (m) => { rows.push(m as Row); if (rows.length % 25 === 0) console.log(`${rows.length} games`); });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`worker ${i} exited ${code}`))));
  })));
  rows.sort((a, b) => a.index - b.index);
  writeFileSync(`${out}.jsonl`, rows.map((r) => JSON.stringify(r.replay)).join("\n") + "\n");
  writeFileSync(`${out}.tallies.jsonl`, rows.map((r, line) => JSON.stringify({ line, ...r.tally })).join("\n") + "\n");
  const finished = rows.filter((r) => r.tally.winner !== null).length;
  console.log(`wrote ${out}.jsonl and ${out}.tallies.jsonl: ${rows.length} games, ${finished} finished`);
}

if (process.argv.includes("--worker")) worker();
else if (process.argv[1] && /corpus\.ts$/.test(process.argv[1])) void main();
