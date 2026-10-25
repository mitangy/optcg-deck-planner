/**
 * Rules-puzzle eval (#677): positions from bot self-play and the Harness, questions whose single right answer the duel
 * engine decides, asked through the production chat and graded exactly. `npm run eval:puzzles` with the real API spends
 * money (needs ANTHROPIC_API_KEY); `--model-api scripted` and `--dump` are free.
 *
 *   --n <per type>           default 25            --seed <n>        default 1
 *   --types power,counter_needed,playable,can_attack,scenario,defend,lethal,scenario_chain   (default all; the last three are the harder ones, #685)
 *   --new-share <0-1>        share of puzzles with an OP18 / EB05 card, default 0.3
 *   --synth-share <0-1>      share of position puzzles from Harness boards instead of self-play, default 0.5
 *   --decks <file>           deck list JSON for self-play (default: the meta decks file if present, else random decks)
 *   --dump                   write puzzles.jsonl and stop: no model, no key, no cost
 *   --model-api anthropic|scripted      --model <id>       default CHAT_MODEL        --library live|none
 *   --max-usd <n>            stop dispatching past this measured spend (default 5)    --concurrency <n>   default 3
 *   --timeout-s <n>          per-puzzle ceiling, default 180       --variant <name>  output folder under evals/out/puzzles
 *   --post                   send the run to the admin page as the puzzles suite (needs ANALYST_API_URL + ANALYST_SERVICE_SECRET; not in a dry run)
 */
import Anthropic from "@anthropic-ai/sdk";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadCatalog } from "../../src/catalog";
import { anthropicModel, CHAT_MODEL } from "../../src/chat";
import { OfficialLibrary } from "../../src/official/library";
import { loadPlaybook } from "../../src/playbook";
import type { PlannerOptions, StatsFixtures, TournamentFixtures } from "../planner";
import { scriptedModel, textReply } from "../scripted";
import { postEvalRun } from "../post";
import { generatePuzzles } from "./generate";
import { askAll, scriptedReply } from "./pipeline";
import { headline, puzzlesRunPayload, renderReport } from "./report";
import { PUZZLE_TYPES, type PuzzleType } from "./types";

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const META_DECKS = "/mnt/project-files/self-play-bots/meta-decks-2026-10-18.json";

const { values: f } = parseArgs({
  options: {
    n: { type: "string", default: "25" },
    seed: { type: "string", default: "1" },
    types: { type: "string" },
    "new-share": { type: "string", default: "0.3" },
    "synth-share": { type: "string", default: "0.5" },
    decks: { type: "string" },
    dump: { type: "boolean", default: false },
    variant: { type: "string" },
    model: { type: "string" },
    library: { type: "string", default: "live" },
    "max-usd": { type: "string", default: "5" },
    concurrency: { type: "string", default: "3" },
    "timeout-s": { type: "string", default: "180" },
    "model-api": { type: "string", default: "anthropic" },
    post: { type: "boolean", default: false },
  },
});

const scripted = f["model-api"] === "scripted";
if (!scripted && f["model-api"] !== "anthropic") throw new Error("--model-api must be anthropic or scripted");
if (!scripted && !f.dump && !process.env.ANTHROPIC_API_KEY) {
  console.error("npm run eval:puzzles spends Anthropic API money and needs ANTHROPIC_API_KEY. For a free dry run use --model-api scripted; to only write the puzzles use --dump.");
  process.exit(2);
}
const types = (f.types ? f.types.split(",").map((t) => t.trim()) : [...PUZZLE_TYPES]) as PuzzleType[];
for (const t of types) if (!PUZZLE_TYPES.includes(t)) throw new Error(`Unknown puzzle type ${t}; use ${PUZZLE_TYPES.join(", ")}.`);
const n = Number(f.n);
const seed = Number(f.seed);
const newShare = Number(f["new-share"]);
const synthShare = Number(f["synth-share"]);
const variant = f.variant ?? (f.dump ? "dump" : scripted ? "dry-run" : "baseline");
const model = f.model ?? CHAT_MODEL;

const catalog = loadCatalog();
const deckFile = f.decks ?? (existsSync(META_DECKS) ? META_DECKS : undefined);
const decks = deckFile ? JSON.parse(readFileSync(deckFile, "utf8")) : undefined;
const generated = generatePuzzles({ seed, n, types, newShare, synthShare, decks, catalog });
const source = `seed ${seed}, ${n} per type, self-play and Harness boards (${Math.round(synthShare * 100)}% Harness), ${Math.round(newShare * 100)}% from OP18 / EB05, decks ${deckFile ?? "random"}`;

const dir = join(here("../out/puzzles"), variant);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "puzzles.jsonl"), generated.puzzles.map((p) => JSON.stringify(p)).join("\n") + "\n");
const counts = types.map((t) => `${t} ${generated.puzzles.filter((p) => p.type === t).length}`).join(", ");
console.log(`${generated.puzzles.length} puzzles (${counts}); wrote ${join(dir, "puzzles.jsonl")}`);
if (Object.keys(generated.short).length) console.warn(`Short of ${n} per type: ${JSON.stringify(generated.short)} (positions a generator turned down: ${JSON.stringify(generated.rejected)})`);
if (f.dump) process.exit(0);

const client = scripted ? null : new Anthropic();
const library = scripted || f.library === "none" ? undefined : new OfficialLibrary({ baseUrl: process.env.OFFICIAL_SITE_URL || undefined });
const planner: PlannerOptions = {
  mode: "fake",
  stats: JSON.parse(readFileSync(here("../fixtures/stats.json"), "utf8")) as StatsFixtures,
  tournaments: JSON.parse(readFileSync(here("../fixtures/tournaments.json"), "utf8")) as TournamentFixtures,
};
const real = client ? anthropicModel(client as never) : null;
const started = Date.now();
const result = await askAll(
  {
    catalog,
    library,
    knowledge: { playbook: loadPlaybook() },
    planner,
    callModel: (p) => real ?? scriptedModel(() => textReply(scriptedReply(p, catalog), model)),
    model,
    timeoutS: Number(f["timeout-s"]),
  },
  generated.puzzles,
  {
    concurrency: Number(f.concurrency),
    maxUsd: Number(f["max-usd"]),
    onRow: (row, spent) => console.log("failure" in row ? `${row.id}: ${row.failure}: ${row.message}` : `${row.id}: ${row.correct ? "right" : `wrong (given ${row.given}, gold ${row.gold})`}, ${spent.toFixed(2)} USD so far`),
  },
);
writeFileSync(join(dir, "answers.jsonl"), result.rows.map((r) => JSON.stringify(r)).join("\n") + (result.rows.length ? "\n" : ""));
const report = renderReport({ variant, mode: scripted ? "scripted" : "anthropic", model, source, puzzles: generated.puzzles, rows: result.rows, errors: result.errors, stoppedAtCap: result.stoppedAtCap, maxUsd: Number(f["max-usd"]) });
writeFileSync(join(dir, "report.md"), report);
console.log(headline(result.rows, result.errors, result.spent) + `, ${((Date.now() - started) / 1000).toFixed(0)}s`);
console.log(`report: ${join(dir, "report.md")}`);
if (f.post) {
  if (scripted) console.error("--post skipped: a --model-api scripted run says nothing about Log Pose.");
  else if (!result.rows.length) console.error("--post skipped: no puzzle was answered.");
  else console.log((await postEvalRun(puzzlesRunPayload({ variant, model, rows: result.rows, errors: result.errors }))).message);
}
process.exit(result.errors.length ? 1 : 0);
