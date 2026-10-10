/**
 * The runner end to end through the real chat loop: a scripted model, the fake planner and the offline judge.
 * No model call, no network, no library (so no A cases and no live C cases).
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCatalog } from "../src/catalog";
import { CHAT_MODEL } from "../src/chat";
import { CASES } from "./cases";
import { offlineJudge } from "./grade/judge";
import { runEval, type RunnerDeps, type RunOptions } from "./runner";
import { oracleScript, scriptedModel, textReply, toolReply, usage, type Script } from "./scripted";
import type { EvalCase } from "./types";

const catalog = loadCatalog();
const c11 = CASES.find((c) => c.id === "C11")!;
const stats = { synthetic: true as const, responses: {} };

function setup(script: (c: EvalCase, gold: Parameters<RunnerDeps["callModel"]>[1]) => Script, cases: EvalCase[] = [c11]) {
  const out = mkdtempSync(join(tmpdir(), "eval-harness-"));
  const deps: RunnerDeps = {
    catalog,
    knowledge: {},
    planner: { mode: "fake", stats },
    judge: offlineJudge(),
    callModel: (c, gold) => scriptedModel(script(c, gold)),
  };
  const opts: RunOptions = { variant: "t", outDir: out, cases, reps: 1, groups: ["A", "B", "C", "D"], concurrency: 1, timeoutS: 30, maxUsd: 100, resume: false, model: CHAT_MODEL, retryMs: 0 };
  const files = (name: string): unknown[] => {
    const text = readFileSync(join(out, "t", name), "utf8");
    return text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  };
  return { deps, opts, files, out };
}

describe("eval runner", () => {
  it("scores a scripted right answer 1 and an empty answer 0 through runChat (#403)", async () => {
    const right = setup((c, gold) => oracleScript(c, gold, catalog, CHAT_MODEL));
    const r1 = await runEval(right.deps, right.opts);
    expect(r1.errors).toEqual([]);
    expect(r1.rows).toHaveLength(1);
    expect(r1.rows[0]).toMatchObject({ case: "C11", status: "ok", grade: { correct: 1, cited: 1, grounded: 1 }, rounds: 2, tool_calls: 1, model: CHAT_MODEL });
    expect(r1.rows[0]!.cost_usd).toBeGreaterThan(0);
    expect(r1.rows[0]!.usage!.input_tokens).toBeGreaterThan(0);
    // The trace holds the saved turn, with the tool result the answer cites.
    const trace = JSON.parse(readFileSync(join(r1.dir, "traces", "C11_rep0.json"), "utf8"));
    expect(JSON.stringify(trace.turn)).toContain("odds:d50h8x1s");

    const empty = setup(() => () => ({ content: [], stop_reason: "end_turn", usage: usage(1000, 0), model: CHAT_MODEL }));
    const r2 = await runEval(empty.deps, empty.opts);
    expect(r2.rows[0]).toMatchObject({ status: "ok", grade: { correct: 0 } });
  });

  it("puts a failed model call in errors.jsonl, not in the scores (#403)", async () => {
    const t = setup(() => () => Object.assign(new Error("bad request"), { status: 400 }));
    const r = await runEval(t.deps, t.opts);
    expect(r.rows).toEqual([]);
    expect(t.files("results.jsonl")).toEqual([]);
    expect(t.files("errors.jsonl")).toEqual([{ case: "C11", rep: 0, failure: "api_error", message: "bad request", retries: 0 }]);
  });

  it("retries an overloaded call and counts the retry (#403)", async () => {
    let n = 0;
    const t = setup((c, gold) => {
      const ok = oracleScript(c, gold, catalog, CHAT_MODEL);
      return (ctx) => (ctx.call === 0 && n++ === 0 ? Object.assign(new Error("overloaded"), { status: 529 }) : ok({ ...ctx, call: ctx.call > 0 ? ctx.call - 1 : 0 }));
    });
    const r = await runEval(t.deps, t.opts);
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ grade: { correct: 1 }, retries: 1 });
  });

  it("rejects a reply served by a different model (#403)", async () => {
    const t = setup(() => () => textReply("78%", "claude-haiku-4-5"));
    const r = await runEval(t.deps, t.opts);
    expect(r.rows).toEqual([]);
    expect(r.errors).toEqual([{ case: "C11", rep: 0, failure: "model_mismatch", message: `call 1 was served by claude-haiku-4-5, not ${CHAT_MODEL}`, retries: 0 }]);
  });

  it("scores running out of tool rounds as a graded 0, not an error (#403)", async () => {
    const t = setup(() => () => toolReply([{ name: "draw_odds", input: { deckSize: 50, hits: 4 } }], CHAT_MODEL));
    const r = await runEval(t.deps, t.opts);
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ status: "ok", grade: { correct: 0, cited: 0, grounded: 0 }, meta: { failure: "too_many_rounds" }, rounds: 12 });
  });

  it("scores a refusal as a graded 0 (#403)", async () => {
    const t = setup(() => () => ({ content: [{ type: "text", text: "I can't help with that." }], stop_reason: "refusal", usage: usage(500, 10), model: CHAT_MODEL }));
    const r = await runEval(t.deps, t.opts);
    expect(r.rows[0]).toMatchObject({ grade: { correct: 0 }, meta: { failure: "refusal" } });
  });

  it("skips a case that needs a tool the chat doesn't offer, and never calls the model for it (#403)", async () => {
    let calls = 0;
    const e02 = { ...CASES.find((c) => c.id === "E02")!, requiresTools: ["no_such_tool"] };
    const t = setup(() => () => (calls++, textReply("x", CHAT_MODEL)), [e02]);
    t.opts.groups = ["A", "B", "C", "D", "E"];
    const r = await runEval(t.deps, t.opts);
    expect(r.rows).toEqual([expect.objectContaining({ case: "E02", status: "skipped", meta: { reason: "needs the no_such_tool tool" } })]);
    expect(calls).toBe(0);
  });

  it("stops dispatching new cases once the spend cap is reached (#403)", async () => {
    const t = setup((c, gold) => oracleScript(c, gold, catalog, CHAT_MODEL), [c11, CASES.find((c) => c.id === "C10")!]);
    t.opts.maxUsd = 0.000001;
    const r = await runEval(t.deps, t.opts);
    expect(r.rows).toHaveLength(1);
    expect(r.stoppedAtCap).toBe(true);
  });

  it("resumes without repeating a case that already has a result (#403)", async () => {
    const t = setup((c, gold) => oracleScript(c, gold, catalog, CHAT_MODEL));
    await runEval(t.deps, t.opts);
    let calls = 0;
    const again = { ...t.deps, callModel: () => scriptedModel(() => (calls++, textReply("x", CHAT_MODEL))) };
    const r = await runEval(again, { ...t.opts, resume: true });
    expect(calls).toBe(0);
    expect(r.rows).toHaveLength(1);
  });
});
