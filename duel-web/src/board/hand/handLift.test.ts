import { describe, expect, it } from "vitest";
import { CARRY_WIDTH_PX, LIFT_SCALE, MAX_TILT_DEG, liftScale, liftTilt } from "./handLift";

describe("hand lift", () => {
  it("holds a lifted card a little bigger over the hand and shrinks it to carry size away from it (#364)", () => {
    expect(liftScale(true, 120)).toBe(LIFT_SCALE);
    expect(liftScale(false, 120) * 120).toBeCloseTo(CARRY_WIDTH_PX);
  });

  it("never grows a small card past its picked-up size when it leaves the hand (#364)", () => {
    expect(liftScale(false, 50)).toBe(LIFT_SCALE);
  });

  it("leans the card the way it moves, upright when still, and caps the lean (#364)", () => {
    expect(liftTilt(0)).toBe(0);
    expect(liftTilt(0.5)).toBeGreaterThan(0);
    expect(liftTilt(-0.5)).toBeLessThan(0);
    expect(liftTilt(50)).toBe(MAX_TILT_DEG);
    expect(liftTilt(-50)).toBe(-MAX_TILT_DEG);
  });
});
