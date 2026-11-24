import type { AnimationSpeed } from "../../settings";

export const FAST_MOTION_SCALE = 0.5;

export type MotionPlan =
  | { mode: "off" }
  | { mode: "fade" }
  | { mode: "move"; scale: number };

// Reduced motion keeps its fade whatever the speed, so Fast never brings travel back for someone who asked for less.
export function motionPlan(speed: AnimationSpeed, reduced: boolean): MotionPlan {
  if (speed === "off") return { mode: "off" };
  if (reduced) return { mode: "fade" };
  return { mode: "move", scale: speed === "fast" ? FAST_MOTION_SCALE : 1 };
}

export function scaledMs(ms: number, scale: number): number {
  return Math.round(ms * scale);
}
