import { describe, expect, it } from "vitest";
import { FAN_MAX_SPREAD_DEG, FAN_STEP_DEG, fanPose } from "./handFan";

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
