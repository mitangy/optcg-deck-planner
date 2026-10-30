import assert from "node:assert/strict";
import { TAKEDOWN_MEMORY_MS, isTakenDown, recordTakedowns, resetTakedowns } from "../src/takedowns.js";

describe("takedown memory (#810)", () => {
  afterEach(() => resetTakedowns());

  it("remembers a taken-down image for a day and then forgets it", () => {
    const t0 = 1_000_000;
    recordTakedowns([{ user_id: 5, kind: "playmat", cosmetic_id: 123 }], t0);
    assert.equal(isTakenDown(123, t0 + TAKEDOWN_MEMORY_MS - 1), true);
    assert.equal(isTakenDown(123, t0 + TAKEDOWN_MEMORY_MS + 1), false);
    assert.equal(isTakenDown(124, t0), false);
  });

  it("hearing the same takedown again does not extend the day", () => {
    const t0 = 1_000_000;
    recordTakedowns([{ user_id: 5, kind: "playmat", cosmetic_id: 123 }], t0);
    recordTakedowns([{ user_id: 5, kind: "playmat", cosmetic_id: 123 }], t0 + TAKEDOWN_MEMORY_MS - 10);
    assert.equal(isTakenDown(123, t0 + TAKEDOWN_MEMORY_MS + 1), false);
  });
});
