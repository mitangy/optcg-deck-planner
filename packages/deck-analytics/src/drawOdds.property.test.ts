import { describe, expect } from "vitest";
import { fc, test } from "@fast-check/vitest";
import { atLeastWithMulligan, hypergeomAtLeast, hypergeomPmf, oddsByTurn } from "./drawOdds";

const NUM_RUNS = 300;
const EPS = 1e-9;

const setupArb = fc
  .integer({ min: 1, max: 60 })
  .chain((N) => fc.tuple(fc.constant(N), fc.integer({ min: 0, max: N }), fc.integer({ min: 0, max: N })));

const overdrawArb = setupArb.chain(([N, K, n]) => fc.tuple(fc.constant(N), fc.constant(K), fc.constant(n), fc.integer({ min: 0, max: 8 })).map(([a, b, c, extra]) => [a, b, c + extra] as const));

const deckArb = fc.integer({ min: 40, max: 60 }).chain((N) => fc.record({ N: fc.constant(N), K: fc.integer({ min: 0, max: N }) }));

describe("draw odds properties (#1322)", () => {
  test.prop([setupArb], { numRuns: NUM_RUNS })("the hypergeometric pmf sums to 1 over the number of hits (#1322)", ([N, K, n]) => {
    let sum = 0;
    for (let j = 0; j <= n; j++) sum += hypergeomPmf(N, K, n, j);
    expect(sum).toBeCloseTo(1, 9);
  });

  test.prop([setupArb, fc.integer({ min: -2, max: 62 })], { numRuns: NUM_RUNS })(
    "at-least odds stay within 0 and 1 (#1322)",
    ([N, K, n], k) => {
      const p = hypergeomAtLeast(N, K, n, k);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    },
  );

  test.prop([overdrawArb, fc.integer({ min: 1, max: 6 })], { numRuns: NUM_RUNS })(
    "at-least odds match the exact pmf tail, with a draw capped at the deck (#1322)",
    ([N, K, n], k) => {
      const draws = Math.min(n, N);
      let tail = 0;
      for (let j = k; j <= draws; j++) tail += hypergeomPmf(N, K, draws, j);
      expect(hypergeomAtLeast(N, K, n, k)).toBeCloseTo(Math.min(1, tail), 9);
    },
  );

  test.prop([deckArb, fc.integer({ min: 1, max: 4 }), fc.boolean(), fc.boolean()], { numRuns: NUM_RUNS })(
    "per-turn odds stay in range and never fall from one turn to the next (#1322)",
    ({ N, K }, atLeast, goingFirst, mulligan) => {
      const odds = oddsByTurn({ deckSize: N, hits: K, atLeast, goingFirst, mulligan, turns: 10 });
      expect(odds).toHaveLength(10);
      for (let i = 0; i < odds.length; i++) {
        expect(odds[i]).toBeGreaterThanOrEqual(0);
        expect(odds[i]).toBeLessThanOrEqual(1);
        if (i > 0) expect(odds[i]!).toBeGreaterThanOrEqual(odds[i - 1]! - EPS);
      }
    },
  );

  test.prop([deckArb, fc.boolean()], { numRuns: NUM_RUNS })(
    "a mulligan never lowers the odds of seeing a hit, and matches p5 + (1 - p5) * p(seen) (#1322)",
    ({ N, K }, goingFirst) => {
      const base = oddsByTurn({ deckSize: N, hits: K, atLeast: 1, goingFirst, mulligan: false });
      const mull = oddsByTurn({ deckSize: N, hits: K, atLeast: 1, goingFirst, mulligan: true });
      const p5 = hypergeomAtLeast(N, K, 5, 1);
      for (let t = 0; t < base.length; t++) {
        expect(mull[t]!).toBeGreaterThanOrEqual(base[t]! - EPS);
        expect(mull[t]!).toBeCloseTo(p5 + (1 - p5) * base[t]!, 9);
      }
    },
  );

  test.prop([deckArb, fc.integer({ min: 1, max: 4 }), fc.integer({ min: 5, max: 14 })], { numRuns: NUM_RUNS })(
    "a mulligan never lowers the odds of seeing several hits either (#1322)",
    ({ N, K }, k, seen) => {
      expect(atLeastWithMulligan(N, K, seen, k)).toBeGreaterThanOrEqual(hypergeomAtLeast(N, K, seen, k) - EPS);
    },
  );
});
