import { describe, expect, it } from "vitest";
import { planShards } from "./e2e-shards.mjs";

const load = (shard, t) => shard.reduce((s, p) => s + (t[p.split("/").pop()] ?? 0), 0);

describe("planShards (#737)", () => {
  it("runs every spec exactly once, including one with no recorded timing (#737)", () => {
    const specs = ["e2e/a.spec.ts", "e2e/b.spec.ts", "e2e/c.spec.ts", "e2e/new.spec.ts"];
    const shards = planShards(specs, { "a.spec.ts": 50, "b.spec.ts": 30, "c.spec.ts": 10 }, 2);
    expect(shards.flat().sort()).toEqual([...specs].sort());
  });

  it("balances by duration, not by count or order (#737)", () => {
    // Optimal split of 7,6,5,4,3,3 over 2 shards is 14 / 14. Round-robin gives 7+5+3=15 vs 13 and in-order chunks give 18 vs 10.
    const t = { "a.spec.ts": 7, "b.spec.ts": 6, "c.spec.ts": 5, "d.spec.ts": 4, "e.spec.ts": 3, "f.spec.ts": 3 };
    const shards = planShards(Object.keys(t).map((f) => `e2e/${f}`), t, 2);
    expect(Math.max(...shards.map((s) => load(s, t)))).toBe(14);
  });
});
