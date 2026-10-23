import { describe, expect, it } from "vitest";
import { postEvalRun } from "./post";
import type { ReviewRow } from "./review-facts/pipeline";
import { reviewFactsRunPayload } from "./review-facts/report";

const env = { ANALYST_API_URL: "https://api.test/", ANALYST_SERVICE_SECRET: "svc" };

const capture = (status = 201) => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response("{}", { status });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
};

describe("posting an eval run to the admin page", () => {
  it("sends the run with the service secret to /admin/evals, as the main suite unless it names another (#679)", async () => {
    const { calls, fetchImpl } = capture();
    const a = await postEvalRun({ label: "x", correct: 40, total: 50 }, { env, fetchImpl });
    const b = await postEvalRun({ suite: "puzzles", label: "y", correct: 3, total: 4 }, { env, fetchImpl });
    expect(a.ok && b.ok).toBe(true);
    expect(calls[0]!.url).toBe("https://api.test/admin/evals");
    expect((calls[0]!.init.headers as Record<string, string>)["x-analyst-service"]).toBe("svc");
    expect(JSON.parse(calls[0]!.init.body as string)).toMatchObject({ suite: "main", correct: 40, total: 50 });
    expect(JSON.parse(calls[1]!.init.body as string).suite).toBe("puzzles");
  });

  it("does not post, and says why, without the API url and secret (#679)", async () => {
    const { calls, fetchImpl } = capture();
    const res = await postEvalRun({ label: "x", correct: 1, total: 2 }, { env: { ANALYST_API_URL: "https://api.test" }, fetchImpl });
    expect(res.ok).toBe(false);
    expect(res.message).toContain("ANALYST_SERVICE_SECRET");
    expect(calls).toHaveLength(0);
  });

  it("reports a refused or failed post instead of throwing (#679)", async () => {
    const refused = await postEvalRun({ label: "x", correct: 1, total: 2 }, { env, fetchImpl: capture(403).fetchImpl });
    expect(refused).toEqual({ ok: false, message: "post to /admin/evals failed: HTTP 403" });
    const down = await postEvalRun({ label: "x", correct: 1, total: 2 }, { env, fetchImpl: (async () => { throw new Error("offline"); }) as unknown as typeof fetch });
    expect(down.ok).toBe(false);
    expect(down.message).toContain("offline");
  });
});

const row = (over: Partial<ReviewRow>): ReviewRow =>
  ({ id: "g1", seed: 1, seat: 0, leaders: ["A", "B"], winner: 0, model: "m", review: "", review_cost_usd: 0.1, extract_cost_usd: 0.05, usage: {}, claims: 10, dropped: 0, invalid: 0, supported: 6, contradicted: 1, wrong_turn: 1, unverifiable: 2, ...over }) as ReviewRow;

describe("the review facts run as the admin page takes it", () => {
  it("headlines wrong claims per review, lower is better, with supported out of checkable as the score (#679)", () => {
    const p = reviewFactsRunPayload({ variant: "baseline", model: "claude-opus-5-5", rows: [row({}), row({ id: "g2", contradicted: 0, wrong_turn: 0, supported: 8 })] });
    expect(p).toMatchObject({ suite: "review_facts", label: "baseline", metric_name: "Wrong claims per review", metric_value: 1, lower_is_better: true, correct: 14, total: 16, spend_usd: 0.3 });
  });

  it("leaves out the score when no claim could be checked (#679)", () => {
    const p = reviewFactsRunPayload({ variant: "v", model: "m", rows: [row({ supported: 0, contradicted: 0, wrong_turn: 0, unverifiable: 10 })] });
    expect(p).toMatchObject({ metric_value: 0, lower_is_better: true });
    expect(p.total).toBeUndefined();
  });
});
