import { describe, expect, it } from "vitest";
import type { Usage } from "../../src/chat";
import { anthropicJudge, judgeCostUsd, JUDGE_MODEL, RUBRIC_MODEL } from "./judge";

const usage: Usage = { input_tokens: 1_000_000, output_tokens: 100_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

function fake() {
  const models: string[] = [];
  const client = {
    beta: {
      messages: {
        create: async (p: { model: string }) => {
          models.push(p.model);
          const text = p.model === RUBRIC_MODEL ? JSON.stringify({ items: [{ id: "R1", pass: true, why: "ok" }] }) : JSON.stringify({ verdict: "yes", legal: "unclear", says_no_official_ruling: false, can: [], cannot: [] });
          return { model: p.model, content: [{ type: "text", text }], usage };
        },
      },
    },
  };
  return { models, judge: anthropicJudge(client as never, { retryMs: 0 }) };
}

describe("eval judge", () => {
  it("judges D rubrics on Opus and the yes/no reading on Sonnet (#414)", async () => {
    const { models, judge } = fake();
    const r = await judge.rubric({ question: "q", answer: "a", toolResults: "t", focus: [] });
    const v = await judge.extractVerdict({ question: "q", answer: "a" });
    expect(models).toEqual([RUBRIC_MODEL, JUDGE_MODEL]);
    expect(r.model).toBe("claude-opus-5-5");
    expect(r.fallback).toBe(false);
    expect(v.model).toBe(JUDGE_MODEL);
    expect(v.fallback).toBe(false);
  });

  it("prices a judge call by the model that answered it (#414)", () => {
    expect(judgeCostUsd(usage, JUDGE_MODEL)).toBeCloseTo(3, 6); // 1M in at $2 + 0.1M out at $10
    expect(judgeCostUsd(usage, RUBRIC_MODEL)).toBeCloseTo(6, 6); // 1M in at $4 + 0.1M out at $20
    expect(judgeCostUsd(usage)).toBeCloseTo(3, 6);
  });
});
