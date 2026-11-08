import { describe, expect, it } from "vitest";
import { MOTION_MS } from "./BoardMotion";
import { motionPlan, scaledMs } from "./motionSpeed";

describe("motionPlan", () => {
  it("plays normal speed at full length", () => {
    expect(motionPlan("normal", false)).toEqual({ mode: "move", scale: 1 });
  });

  it("plays fast at half the duration of normal", () => {
    const plan = motionPlan("fast", false);
    expect(plan.mode).toBe("move");
    if (plan.mode !== "move") return;
    expect(scaledMs(MOTION_MS.shuffle, plan.scale)).toBe(MOTION_MS.shuffle / 2);
    expect(scaledMs(60, plan.scale)).toBe(30);
  });

  it("skips card motion when off, even when reduced motion is on", () => {
    expect(motionPlan("off", false)).toEqual({ mode: "off" });
    expect(motionPlan("off", true)).toEqual({ mode: "off" });
  });

  it("keeps the reduced-motion fade over normal and fast", () => {
    expect(motionPlan("normal", true)).toEqual({ mode: "fade" });
    expect(motionPlan("fast", true)).toEqual({ mode: "fade" });
  });
});

describe("scaledMs", () => {
  it("scales a duration or delay by the plan scale", () => {
    expect(scaledMs(300, 1)).toBe(300);
    expect(scaledMs(300, 0.5)).toBe(150);
  });
});
