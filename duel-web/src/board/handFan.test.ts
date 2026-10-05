import { describe, expect, it } from "vitest";
import { FAN_MAX_SPREAD_DEG, FAN_MIN_STEP, FAN_STEP_DEG, fanPose, fanSpan, handDrawer } from "./handFan";

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

describe("fanSpan", () => {
  it("squeezes a big hand to the mat's width instead of running off the screen (#281)", () => {
    // 19 cards of 100px raised would be 1540px wide; the mat is 700px.
    expect(fanSpan(19, 100, 0.8, 700)).toBe(700);
  });

  it("leaves a small hand at its natural width (#281)", () => {
    // 4 cards, each after the first adds 0.8 of a card: 340px, well inside 700px.
    expect(fanSpan(4, 100, 0.8, 700)).toBeCloseTo(340);
  });

  it("stops overlapping at the minimum step when even the mat is too small (#281)", () => {
    // The mat allows 300px, but 19 cards need 100 * (0.22 * 18 + 1) to stay readable.
    expect(fanSpan(19, 100, 0.8, 300)).toBeCloseTo(100 * (FAN_MIN_STEP * 18 + 1));
  });

  it("is uncapped when the mat could not be measured (#281)", () => {
    expect(fanSpan(19, 100, 0.8, null)).toBeCloseTo(100 * (0.8 * 18 + 1));
  });
});
