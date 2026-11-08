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

    // Same needed + already on that seat: manualPass can stick (no-op hold).
    const held = applyHotseatAutoPass({
      needed: 0,
      activeSeat: 0,
      lastNeeded: 0,
      manualPass: true,
    });
    expect(held).toEqual({ activeSeat: 0, lastNeeded: 0, manualPass: true });
  });

  it("forces handoff when needed seat differs despite manualPass (Rocks pending)", () => {
    // Device was passed to Teach (or briefly handed for block) while Rocks
    // When Attacking still owns needed=0 — pending must win.
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
