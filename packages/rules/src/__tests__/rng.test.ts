import { describe, expect, it } from "vitest";
import { createSeededRng } from "../rng.js";

// Previous sequential algorithm, kept here as an independent compatibility oracle.
function legacy(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

describe("snapshot RNG restoration", () => {
  it.each([0, 1, 42, 0xffffffff, -1])("preserves sequential output for seed %s", (seed) => {
    const rng = createSeededRng(seed);
    const prior = legacy(seed);
    for (let i = 0; i < 10000; i++) expect(rng.next()).toBe(prior());
    const resumed = createSeededRng(JSON.parse(JSON.stringify(rng.snapshot())));
    expect(resumed.shuffle([1, 2, 3, 4, 5])).toEqual(rng.shuffle([1, 2, 3, 4, 5]));
    expect(resumed.snapshot()).toEqual(rng.snapshot());
  });

  it("restores large cursors immediately and preserves uint32 wraparound", () => {
    const small = createSeededRng({ seed: 42, cursor: 7 });
    const large = createSeededRng({ seed: 42, cursor: 2 ** 32 + 7 });
    expect(large.next()).toBe(small.next());
    expect(large.snapshot().cursor).toBe(2 ** 32 + 8);
  });

  it.each([
    { seed: -1, cursor: 0 }, { seed: 2 ** 32, cursor: 0 },
    { seed: 1, cursor: -1 }, { seed: 1, cursor: 0.5 },
    { seed: 1, cursor: Number.MAX_SAFE_INTEGER + 1 },
    { seed: NaN, cursor: 0 }, { seed: 1, cursor: Infinity },
  ])("rejects invalid serialized state %j", (state) => {
    expect(() => createSeededRng(state)).toThrow(/Invalid RNG snapshot/);
  });

  it("rejects exhaustion without mutating the last valid cursor", () => {
    const rng = createSeededRng({ seed: 1, cursor: Number.MAX_SAFE_INTEGER });
    expect(() => rng.next()).toThrow(/exhausted/);
    expect(rng.snapshot().cursor).toBe(Number.MAX_SAFE_INTEGER);
  });
});
