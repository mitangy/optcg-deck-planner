import { describe, expect, it } from "vitest";
import { pairedStats, wilson, type PairRow } from "../sim/versusStats.js";

/** Pair k = games 2k and 2k + 1; `wins` is how many of the two A won (null = a game did not finish). */
const pairs = (wins: (0 | 1 | 2 | null)[]): PairRow[] =>
  wins.flatMap((w, k) => [
    { g: 2 * k, winner: w === null ? null : w >= 1 ? ("a" as const) : ("b" as const) },
    { g: 2 * k + 1, winner: w === null ? ("b" as const) : w === 2 ? ("a" as const) : ("b" as const) },
  ]);

describe("versus paired statistics", () => {
  it("scores a split pair as half, so the paired interval is narrower than the one over single games when A never loses both (#VALUE_PR)", () => {
    const rows = pairs([...Array<2>(8).fill(2), ...Array<1>(12).fill(1)]);
    const p = pairedStats(rows);
    expect(p).toMatchObject({ aBoth: 8, split: 12, bBoth: 0 });
    expect(p.pairedRate).toBeCloseTo(0.7, 10);
    expect(p.pairedCi[0]).toBeCloseTo(0.5898, 3);
    expect(p.pairedCi[1]).toBeCloseTo(0.8102, 3);
    const aWins = rows.filter((r) => r.winner === "a").length;
    const [lo, hi] = wilson(aWins, rows.length);
    expect(aWins / rows.length).toBeCloseTo(0.7, 10);
    expect(p.pairedCi[1] - p.pairedCi[0]).toBeLessThan(hi - lo - 0.02);
  });

  it("leaves out a pair with an unfinished game (#VALUE_PR)", () => {
    const p = pairedStats(pairs([2, 0, null, 1]));
    expect(p).toMatchObject({ aBoth: 1, split: 1, bBoth: 1 });
    expect(p.pairedRate).toBeCloseTo(0.5, 10);
  });

  it("has no information without a finished pair (#VALUE_PR)", () => {
    expect(pairedStats(pairs([null])).pairedCi).toEqual([0, 1]);
  });
});
