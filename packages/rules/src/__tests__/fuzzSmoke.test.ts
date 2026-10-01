import { describe, expect, it } from "vitest";
import { runSmoke } from "../sim/fuzzSmoke.js";

describe("fuzz smoke", () => {
  it("random games keep every engine invariant", () => {
    const result = runSmoke(12, 1);
    expect(result.failures.slice(0, 3)).toEqual([]);
    expect(result.intents).toBeGreaterThan(0);
  }, 60_000);
});
