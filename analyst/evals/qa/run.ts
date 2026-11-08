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
 *   --post                  send the run's score to the admin page (POST /admin/evals; needs ANALYST_API_URL + ANALYST_SERVICE_SECRET)
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadCatalog } from "../../src/catalog";
import { anthropicModel, apiTools, CHAT_INSTRUCTIONS, CHAT_MODEL } from "../../src/chat";
import { loadPlaybook } from "../../src/playbook";
import { instructionsFor } from "../../src/prompts/connector";
import { buildTools } from "../../src/server";
import { CASES } from "./cases";
import { anthropicJudge, JUDGE_MODEL, RUBRIC_MODEL, offlineJudge, type Judge } from "../grade/judge";
import { loadCases } from "./load";
import { anthropicClient, commonOptions, defaultVariant, libraryFor, modelApi, OUT_ROOT, plannerFixtures } from "../shared/cli";
import { evalPlanner, type PlannerOptions } from "../shared/planner";
import { postEvalRun } from "../shared/post";
import { baselineFrom, evalRunPayload, renderReport, stateFile, summaryLine } from "./report";
import { runEval } from "./runner";
import { oracleScript, scriptedModel } from "./scripted";
import { selftest } from "./selftest";
import type { Group, RunMeta } from "./types";

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const { values: f } = parseArgs({
  options: {
    ...commonOptions({ maxUsd: "15", concurrency: "4", timeoutS: "180" }),
    reps: { type: "string", default: "2" },
    only: { type: "string" },
    group: { type: "string", default: "A,B,C,D" },
    planner: { type: "string", default: "fake" },
    library: { type: "string", default: "live" },
    resume: { type: "boolean", default: false },
    selftest: { type: "boolean", default: false },
    "write-baseline": { type: "boolean", default: false },
  },
});

const { scripted } = modelApi(f["model-api"], { script: "eval" });
if (scripted && f["write-baseline"]) throw new Error("A scripted run cannot write the baseline.");
const variant = defaultVariant(f.variant, scripted);

const catalog = loadCatalog();
const cases = loadCases(catalog, CASES);
const client = anthropicClient(scripted);
const judge: Judge = client ? anthropicJudge(client as never) : offlineJudge();

if (f.selftest) {
  const r = await selftest(catalog, judge);
  console.log(r.lines.join("\n"));
  process.exit(r.ok ? 0 : 1);
}

const library = libraryFor(f.library);
const playbook = loadPlaybook();
const planner: PlannerOptions = {
  mode: f.planner === "live" ? "live" : "fake",
  ...plannerFixtures(),
  liveUrl: process.env.PLANNER_API_URL,
  secret: process.env.ANALYST_SERVICE_SECRET,
};
if (planner.mode === "live" && !(planner.liveUrl && planner.secret)) throw new Error("--planner live needs PLANNER_API_URL and ANALYST_SERVICE_SECRET.");

const model = anthropicModel((client ?? {}) as never);
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
    outDir: OUT_ROOT,
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
  judge_model: scripted ? "offline-judge" : `${JUDGE_MODEL} (D rubrics: ${RUBRIC_MODEL})`,
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
writeFileSync(join(OUT_ROOT, "_state.json"), JSON.stringify(stateFile(result.rows, meta), null, 2));
console.log(summaryLine(result.rows, result.errors, wallS));
console.log(`report: ${result.dir}/report.md`);
if (f["write-baseline"]) {
  writeFileSync(here("baseline.json"), `${JSON.stringify(baselineFrom(result.rows, meta, wallS), null, 2)}\n`);
  console.log("wrote evals/qa/baseline.json (commit it with the change it measured)");
}
if (f.post) console.log((await postEvalRun(evalRunPayload(result.rows, meta))).message);
process.exit(result.errors.length ? 1 : 0);
