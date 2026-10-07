/**
 * Runs eval cases through the real in-app chat loop (`runChat`, unchanged) with a fake planner, and grades
 * the saved turn. Everything outside the model (the judge, the library, the planner) is injected, so the
 * harness tests and the dry run use a scripted model and cost nothing.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Catalog } from "../src/catalog";
import { costUsd, MAX_TOOL_ROUNDS, runChat, type CallModel, type Usage } from "../src/chat";
import type { OfficialLibrary } from "../src/official/library";
import { banListProblems } from "../src/official/banlist";
import { within } from "../src/official/library";
import { buildTools, type Knowledge } from "../src/server";
import { messageOf } from "./cases";
import { gradeAnswer } from "./grade";
import { judgeCostUsd, type Judge } from "./grade/judge";
import { OfficialUnavailable, goldFor } from "./gold";
import { evalPlanner, type PlannerOptions } from "./planner";
import { withRetry } from "./retry";
import { summarizeTurn } from "./trace";
import type { ErrorRow, EvalCase, Gold, Group, Row } from "./types";
import { createHash } from "node:crypto";

export class ModelMismatch extends Error {}

export type RunnerDeps = {
  catalog: Catalog;
  library?: OfficialLibrary;
  knowledge: Pick<Knowledge, "playbook">;
  /** The model for one attempt (the dry run's oracle needs the case and its gold). */
  callModel: (c: EvalCase, gold: Gold) => CallModel;
  judge: Judge;
  planner: Omit<PlannerOptions, "mode"> & { mode: PlannerOptions["mode"] };
};

export type RunOptions = {
  variant: string;
  outDir: string;
  cases: EvalCase[];
  reps: number;
  groups: Group[];
  only?: RegExp;
  concurrency: number;
  timeoutS: number;
  maxUsd: number;
  resume: boolean;
  /** The model every call must be served by. */
  model: string;
  /** Base delay for retries after 429/529/5xx; tests pass 0. */
  retryMs?: number;
};

export type RunResult = { rows: Row[]; errors: ErrorRow[]; stoppedAtCap: boolean; dir: string };

const readJsonl = <T>(file: string): T[] =>
  existsSync(file)
    ? readFileSync(file, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as T)
    : [];

const addUsage = (a: Usage, b: Usage): Usage => ({
  input_tokens: a.input_tokens + b.input_tokens,
  output_tokens: a.output_tokens + b.output_tokens,
  cache_read_input_tokens: (a.cache_read_input_tokens ?? 0) + (b.cache_read_input_tokens ?? 0),
  cache_creation_input_tokens: (a.cache_creation_input_tokens ?? 0) + (b.cache_creation_input_tokens ?? 0),
});
const ZERO: Usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

type CallRecord = { model?: string; stop_reason: string | null; usage: Usage; ms: number };

export async function runEval(deps: RunnerDeps, opts: RunOptions): Promise<RunResult> {
  const dir = join(opts.outDir, opts.variant);
  mkdirSync(join(dir, "traces"), { recursive: true });
  const resultsFile = join(dir, "results.jsonl");
  const errorsFile = join(dir, "errors.jsonl");
  if (!opts.resume) for (const f of [resultsFile, errorsFile]) writeFileSync(f, "");
  const done = new Set(readJsonl<Row>(resultsFile).map((r) => `${r.case}#${r.rep}`));
  const rows: Row[] = readJsonl<Row>(resultsFile);
  const errors: ErrorRow[] = [];
  const log = (row: Row) => {
    rows.push(row);
    appendFileSync(resultsFile, `${JSON.stringify(row)}\n`);
  };
  const fail = (e: ErrorRow) => {
    errors.push(e);
    appendFileSync(errorsFile, `${JSON.stringify(e)}\n`);
  };

  // Which tools the chat offers, to skip cases that need a tool that is not on main yet.
  const probe = evalPlanner({ ...deps.planner });
  const offered = new Set(buildTools(deps.catalog, undefined, { api: probe.api, token: "chat.eval" }, { library: deps.library, playbook: deps.knowledge.playbook, stats: probe.api }).map((t) => t.name));

  const selected = opts.cases.filter((c) => opts.groups.includes(c.group) && (!opts.only || opts.only.test(c.id)));
  const work: { c: EvalCase; gold: Gold; rep: number }[] = [];
  for (const c of selected) {
    const missing = (c.requiresTools ?? []).filter((t) => !offered.has(t));
    if (missing.length) {
      if (!done.has(`${c.id}#0`)) log(blank(c, 0, "skipped", `needs the ${missing.join(", ")} tool`));
      continue;
    }
    let gold: Gold;
    try {
      gold = await goldFor(c, { catalog: deps.catalog, library: deps.library });
    } catch (err) {
      fail({ case: c.id, rep: 0, failure: err instanceof OfficialUnavailable ? "api_error" : "grader_error", message: `gold: ${msgOf(err)}`, retries: 0 });
      continue;
    }
    if (gold.status !== "ok") {
      if (!done.has(`${c.id}#0`)) log(blank(c, 0, gold.status, gold.reason));
      continue;
    }
    for (let rep = 0; rep < opts.reps; rep++) if (!done.has(`${c.id}#${rep}`)) work.push({ c, gold, rep });
  }

  let spent = rows.reduce((s, r) => s + r.cost_usd, 0);
  let stoppedAtCap = false;
  let next = 0;
  const worker = async () => {
    for (;;) {
      if (spent >= opts.maxUsd) {
        stoppedAtCap = next < work.length;
        return;
      }
      const item = work[next++];
      if (!item) return;
      const out = await attempt(deps, opts, item.c, item.gold, item.rep, dir);
      if ("failure" in out) fail(out);
      else {
        spent += out.cost_usd;
        log(out);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency) }, worker));
  return { rows, errors, stoppedAtCap, dir };
}

const msgOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

function blank(c: EvalCase, rep: number, status: Row["status"], reason?: string): Row {
  return { case: c.id, group: c.group, rep, status, tool_calls: 0, rounds: 0, latency_s: 0, cost_usd: 0, retries: 0, ...(reason ? { meta: { reason } } : {}) };
}

async function attempt(deps: RunnerDeps, opts: RunOptions, c: EvalCase, gold: Gold, rep: number, dir: string): Promise<Row | ErrorRow> {
  const started = Date.now();
  const { api, captured } = evalPlanner({ ...deps.planner });
  const calls: CallRecord[] = [];
  let retries = 0;
  const base = deps.callModel(c, gold);
  const ceiling = AbortSignal.timeout(opts.timeoutS * 1000);
  const callModel: CallModel = async (params, onText, signal, onCite) => {
    const t0 = Date.now();
    const reply = await withRetry(() => base(params, onText, signal, onCite), { signal, baseMs: opts.retryMs, onRetry: () => retries++ });
    calls.push({ model: reply.model, stop_reason: reply.stop_reason, usage: reply.usage, ms: Date.now() - t0 });
    if (reply.model !== opts.model) throw new ModelMismatch(`call ${calls.length} was served by ${reply.model ?? "an unknown model"}, not ${opts.model}`);
    return reply;
  };
  const chatDeps = { api, catalog: deps.catalog, knowledge: { library: deps.library, playbook: deps.knowledge.playbook, stats: api }, callModel };
  const fault = (failure: ErrorRow["failure"], message: string): ErrorRow => ({ case: c.id, rep, failure, message, retries });
  let graded: Row["meta"];
  try {
    await runChat(chatDeps, "chat.eval", { message: messageOf(c), context: c.context }, () => undefined, ceiling);
  } catch (err) {
    if (err instanceof ModelMismatch) return fault("model_mismatch", err.message);
    if (ceiling.aborted) return fault("timeout", `no answer within ${opts.timeoutS}s`);
    if (calls.length >= MAX_TOOL_ROUNDS && /too many lookups/.test(msgOf(err))) graded = { failure: "too_many_rounds" };
    else return fault("api_error", msgOf(err));
  }
  if (!graded && calls.some((k) => k.stop_reason === "refusal")) graded = { failure: "refusal" };

  const usage = calls.reduce((u, k) => addUsage(u, k.usage), ZERO);
  const turn = captured.turn ?? [];
  const t = summarizeTurn(turn);
  const base_row: Row = {
    case: c.id,
    group: c.group,
    rep,
    status: "ok",
    model: calls[calls.length - 1]?.model,
    usage,
    tool_calls: t.toolCalls.length,
    rounds: calls.length,
    latency_s: Math.round((Date.now() - started) / 100) / 10,
    cost_usd: costUsd(usage),
    retries,
    answer_sha256: createHash("sha256").update(t.answer).digest("hex"),
  };
  const writeTrace = (extra: object) =>
    writeFileSync(join(dir, "traces", `${c.id}_rep${rep}.json`), JSON.stringify({ case: c.id, rep, gold, calls, turn, ...extra }, null, 2));

  if (graded) {
    writeTrace({ meta: graded });
    return { ...base_row, grade: { correct: 0, cited: 0, grounded: 0 }, explanation: { correct: graded.failure === "refusal" ? "the model refused" : "ran out of tool rounds" }, meta: graded };
  }
  if (calls[calls.length - 1]?.stop_reason === "max_tokens") {
    writeTrace({ status: "truncated" });
    return { ...base_row, status: "truncated" };
  }
  try {
    const banList = c.group === "D" && deps.library ? await within(deps.library.banList(), 15_000).catch(() => undefined) : undefined;
    const result = await gradeAnswer(c, gold, t, {
      catalog: deps.catalog,
      judge: deps.judge,
      extraBanProblems: banList ? (cards, leaderId) => banListProblems(banList, cards, leaderId).map((p) => p.problem) : undefined,
    });
    const judgeUsage = result.judged.reduce((u, j) => addUsage(u, j.usage), ZERO);
    const judgeCost = result.judged.reduce((s, j) => s + judgeCostUsd(j.usage), 0);
    writeTrace({ grade: result.grade, explanation: result.explanation, rubric: result.rubric });
    return {
      ...base_row,
      cost_usd: base_row.cost_usd + judgeCost,
      grade: result.grade,
      explanation: result.explanation,
      ...(result.judged.length ? { judge_model: result.judged[0]!.model, judge_usage: judgeUsage, judge_fallback: result.judged.some((j) => j.fallback) } : {}),
    };
  } catch (err) {
    return fault("grader_error", msgOf(err));
  }
}
