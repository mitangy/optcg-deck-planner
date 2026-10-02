import { describe, expect, it } from "vitest";
import { FAN_MAX_SPREAD_DEG, FAN_STEP_DEG, fanPose, handDrawer } from "./handFan";

describe("fanPose", () => {
  it("leans the outer cards of a full hand no further apart than the max spread", () => {
    const n = 10;
    const spread = fanPose(n - 1, n).rot - fanPose(0, n).rot;
    expect(spread).toBeCloseTo(FAN_MAX_SPREAD_DEG);
  });

  it("mirrors the fan around the middle card, which stands straight", () => {
    const n = 5;
    expect(fanPose(2, n)).toEqual({ rot: 0, drop: 0 });
    expect(fanPose(0, n).rot).toBeCloseTo(-2 * FAN_STEP_DEG);
    expect(fanPose(4, n).rot).toBeCloseTo(2 * FAN_STEP_DEG);
    expect(fanPose(4, n).drop).toBeCloseTo(fanPose(0, n).drop);
    expect(fanPose(4, n).drop).toBeGreaterThan(fanPose(3, n).drop);
  });
});

describe("handDrawer", () => {
  const rest = { pinned: false, hidden: false, mulligan: false, selected: false };

  it("keeps a hidden hand hidden even while pinned or with a card selected (#259)", () => {
    expect(handDrawer({ ...rest, pinned: true, hidden: true })).toBe("hidden");
    expect(handDrawer({ ...rest, pinned: true, hidden: true, selected: true })).toBe("hidden");
    expect(handDrawer({ ...rest, pinned: true })).toBe("open");
    expect(handDrawer(rest)).toBe("tucked");
  });

  it("shows a hidden hand during the mulligan (#259)", () => {
    expect(handDrawer({ ...rest, pinned: true, hidden: true, mulligan: true })).toBe("open");
  });

  it("shows a hidden or tucked hand while an effect picks cards from it (#263)", () => {
    expect(handDrawer({ ...rest, hidden: true, picking: true })).toBe("open");
    expect(handDrawer({ ...rest, picking: true })).toBe("open");
  });
});
