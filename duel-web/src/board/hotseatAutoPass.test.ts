import { describe, expect, it } from "vitest";
import { applyHotseatAutoPass } from "./hotseatAutoPass";

describe("applyHotseatAutoPass", () => {
  it("respects manual pass while needed seat stays the turn player", () => {
    const first = applyHotseatAutoPass({
      needed: 0,
      activeSeat: 0,
      lastNeeded: null,
      manualPass: false,
    });
    expect(first).toEqual({ activeSeat: 0, lastNeeded: 0, manualPass: false });

    const manual = applyHotseatAutoPass({
      needed: 0,
      activeSeat: 1,
      lastNeeded: 0,
      manualPass: true,
    });
    expect(manual).toEqual({ activeSeat: 1, lastNeeded: 0, manualPass: true });
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
