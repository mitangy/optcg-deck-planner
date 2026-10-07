/**
 * Log Pose eval runner. `npm run eval -w @optcg/analyst` runs the 50 cases through the real chat loop with the
 * real model (paid: needs ANTHROPIC_API_KEY). `--model-api scripted` is a free dry run with a fake model and judge.
 *
 *   --variant <name>        output folder under evals/out (default baseline; dry-run for --model-api scripted)
 *   --reps <n>              repetitions per case (default 2)
 *   --only <regex>          case ids to run      --group A,B,C,D,E   groups to run (default A,B,C,D)
 *   --concurrency <n>       default 4            --timeout-s <n>     per-case ceiling, default 180
 *   --max-usd <n>           stop dispatching past this measured spend (default 15)
 *   --planner fake|live     live forwards stats/corpus/tournament reads to PLANNER_API_URL (chat/usage stay local)
 *   --model-api anthropic|scripted      --library live|none     --resume     --selftest     --write-baseline
 */
import Anthropic from "@anthropic-ai/sdk";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadCatalog } from "../src/catalog";
import { anthropicModel, apiTools, CHAT_INSTRUCTIONS, CHAT_MODEL } from "../src/chat";
import { OfficialLibrary } from "../src/official/library";
import { loadPlaybook } from "../src/playbook";
import { buildTools, instructionsFor } from "../src/server";
import { CASES } from "./cases";
import { anthropicJudge, JUDGE_MODEL, offlineJudge, type Judge } from "./grade/judge";
import { loadCases } from "./load";
import { evalPlanner, type PlannerOptions, type StatsFixtures } from "./planner";
import { baselineFrom, renderReport, stateFile, summaryLine } from "./report";
import { runEval } from "./runner";
import { oracleScript, scriptedModel } from "./scripted";
import { selftest } from "./selftest";
import type { Group, RunMeta } from "./types";

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const { values: f } = parseArgs({
  options: {
    variant: { type: "string" },
    reps: { type: "string", default: "2" },
    only: { type: "string" },
    group: { type: "string", default: "A,B,C,D" },
    concurrency: { type: "string", default: "4" },
    "timeout-s": { type: "string", default: "180" },
    "max-usd": { type: "string", default: "15" },
    planner: { type: "string", default: "fake" },
    "model-api": { type: "string", default: "anthropic" },
    library: { type: "string", default: "live" },
    resume: { type: "boolean", default: false },
    selftest: { type: "boolean", default: false },
    "write-baseline": { type: "boolean", default: false },
  },
});

const scripted = f["model-api"] === "scripted";
if (!scripted && f["model-api"] !== "anthropic") throw new Error("--model-api must be anthropic or scripted");
if (!scripted && !process.env.ANTHROPIC_API_KEY) {
  console.error("npm run eval spends Anthropic API money and needs ANTHROPIC_API_KEY. For a free dry run use --model-api scripted.");
  process.exit(2);
}
if (scripted && f["write-baseline"]) throw new Error("A scripted run cannot write the baseline.");
const variant = f.variant ?? (scripted ? "dry-run" : "baseline");

const catalog = loadCatalog();
const cases = loadCases(catalog, CASES);
const client = scripted ? null : new Anthropic();
const judge: Judge = client ? anthropicJudge(client as never) : offlineJudge();

if (f.selftest) {
  const r = await selftest(catalog, judge);
  console.log(r.lines.join("\n"));
  process.exit(r.ok ? 0 : 1);
}

const library = f.library === "none" ? undefined : new OfficialLibrary({ baseUrl: process.env.OFFICIAL_SITE_URL || undefined });
const playbook = loadPlaybook();
const stats = JSON.parse(readFileSync(here("fixtures/stats.json"), "utf8")) as StatsFixtures;
const planner: PlannerOptions = {
  mode: f.planner === "live" ? "live" : "fake",
  stats,
  liveUrl: process.env.PLANNER_API_URL,
  secret: process.env.ANALYST_SERVICE_SECRET,
};
if (planner.mode === "live" && !(planner.liveUrl && planner.secret)) throw new Error("--planner live needs PLANNER_API_URL and ANALYST_SERVICE_SECRET.");

const model = anthropicModel((client ?? ({} as Anthropic)) as never);
const started = Date.now();
const result = await runEval(
  {
    catalog,
    library,
    knowledge: { playbook },
    planner,
    judge,
    callModel: (c, gold) => (scripted ? scriptedModel(oracleScript(c, gold, catalog, CHAT_MODEL)) : model),
  },
  {
    variant,
    outDir: here("out"),
    cases,
    reps: Number(f.reps),
    groups: f.group!.split(",").map((g) => g.trim().toUpperCase()) as Group[],
    only: f.only ? new RegExp(f.only) : undefined,
    concurrency: Number(f.concurrency),
    timeoutS: Number(f["timeout-s"]),
    maxUsd: Number(f["max-usd"]),
    resume: f.resume!,
    model: CHAT_MODEL,
  },
);
const wallS = (Date.now() - started) / 1000;

let gitSha = "unknown";
try {
  gitSha = execSync("git rev-parse HEAD", { cwd: here("."), encoding: "utf8" }).trim();
} catch {
  /* not a git checkout */
}
const probe = evalPlanner(planner);
const tools = buildTools(catalog, undefined, { api: probe.api, token: "chat.eval" }, { library, playbook, stats: probe.api });
const meta: RunMeta = {
  variant,
  git_sha: gitSha,
  model: CHAT_MODEL,
  judge_model: scripted ? "offline-judge" : JUDGE_MODEL,
  prompt_sha: sha(instructionsFor(true) + CHAT_INSTRUCTIONS),
  tools_sha: sha(JSON.stringify(apiTools(tools))),
  cases_sha: sha(readFileSync(here("cases.ts"), "utf8")),
  reps: Number(f.reps),
};
let baseline;
try {
  baseline = JSON.parse(readFileSync(here("baseline.json"), "utf8"));
} catch {
  /* no baseline yet */
}
writeFileSync(`${result.dir}/report.md`, renderReport({ ...result, meta, wallS, cases, baseline }));
writeFileSync(here("out/_state.json"), JSON.stringify(stateFile(result.rows, meta), null, 2));
console.log(summaryLine(result.rows, result.errors, wallS));
console.log(`report: ${result.dir}/report.md`);
if (f["write-baseline"]) {
  writeFileSync(here("baseline.json"), `${JSON.stringify(baselineFrom(result.rows, meta, wallS), null, 2)}\n`);
  console.log("wrote evals/baseline.json (commit it with the change it measured)");
}
process.exit(result.errors.length ? 1 : 0);
