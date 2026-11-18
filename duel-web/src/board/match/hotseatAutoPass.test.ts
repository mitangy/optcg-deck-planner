import { describe, expect, it } from "vitest";
import { applyHotseatAutoPass } from "./hotseatAutoPass";

describe("applyHotseatAutoPass", () => {
  it("allows manual pass only while already holding the needed seat", () => {
    const first = applyHotseatAutoPass({
      needed: 0,
      activeSeat: 0,
      lastNeeded: null,
      manualPass: false,
    });
    expect(first).toEqual({ activeSeat: 0, lastNeeded: 0, manualPass: false });

    const held = applyHotseatAutoPass({
      needed: 0,
      activeSeat: 0,
      lastNeeded: 0,
      manualPass: true,
    });
    expect(held).toEqual({ activeSeat: 0, lastNeeded: 0, manualPass: true });
  });

  it("forces handoff when needed seat differs despite manualPass (Rocks pending)", () => {
    const forced = applyHotseatAutoPass({
      needed: 0,
      activeSeat: 1,
      lastNeeded: 0,
      manualPass: true,
    });
    expect(forced).toEqual({ activeSeat: 0, lastNeeded: 0, manualPass: false });
  });

  it("auto-passes when needed seat changes (turn advance)", () => {
    const next = applyHotseatAutoPass({
      needed: 1,
      activeSeat: 0,
      lastNeeded: 0,
      manualPass: true,
    });
    expect(next).toEqual({ activeSeat: 1, lastNeeded: 1, manualPass: false });
  });
});
