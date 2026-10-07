import { describe, expect, it } from "vitest";
import { caseMeans, flipped, pairedDelta, score } from "./stats";
import type { Row } from "./types";

const row = (c: string, rep: number, correct: 0 | 1, status: Row["status"] = "ok"): Row => ({
  case: c,
  group: "A",
  rep,
  status,
  grade: { correct, cited: 1, grounded: 1 },
  tool_calls: 0,
  rounds: 0,
  latency_s: 0,
  cost_usd: 0,
  retries: 0,
});

describe("eval statistics", () => {
  it("averages reps within a case before averaging cases (#403)", () => {
    // X was run twice and right both times, Y once and wrong: 0.5 of the cases, not 2 of 3 attempts.
    const rows = [row("X", 0, 1), row("X", 1, 1), row("Y", 0, 0)];
    expect(caseMeans(rows, "correct")).toEqual(new Map([["X", 1], ["Y", 0]]));
    expect(score(rows, "correct")).toEqual({ n: 2, mean: 0.5, sum: 1 });
  });

  it("leaves truncated and error-free-but-unscored rows out of the averages (#403)", () => {
    const rows = [row("X", 0, 1), row("X", 1, 0, "truncated"), row("Z", 0, 0, "stale")];
    expect(caseMeans(rows, "correct")).toEqual(new Map([["X", 1]]));
  });

  it("reports the cases whose mean moved by 0.5 or more, and a paired delta over the cases both runs have (#403)", () => {
    const base = new Map([["A01", 1], ["A02", 0.5], ["A03", 1], ["OLD", 1]]);
    const next = new Map([["A01", 0], ["A02", 1], ["A03", 1], ["NEW", 0]]);
    expect(flipped(base, next)).toEqual([{ id: "A01", from: 1, to: 0 }, { id: "A02", from: 0.5, to: 1 }]);
    expect(pairedDelta(base, next)).toMatchObject({ n: 3, mean: (-1 + 0.5 + 0) / 3 });
  });
});
