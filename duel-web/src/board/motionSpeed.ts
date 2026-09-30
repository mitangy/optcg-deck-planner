import type { AnimationSpeed } from "../settings";

/** Fast plays every card motion (duration and stagger) at this fraction of normal. */
export const FAST_MOTION_SCALE = 0.5;

/** What BoardMotion does for a batch of cues. */
export type MotionPlan =
  /** Nothing moves. */
  | { mode: "off" }
  /** Reduced motion: arrivals fade in place. */
  | { mode: "fade" }
  /** Full card motion, with every duration multiplied by `scale`. */
  | { mode: "move"; scale: number };

/**
 * Off skips card motion outright. Otherwise reduced motion (the OS setting or
 * "Reduce animations") keeps its fade whatever the speed, so Fast never
 * brings travel back for someone who asked for less.
 */
export function motionPlan(speed: AnimationSpeed, reduced: boolean): MotionPlan {
  if (speed === "off") return { mode: "off" };
  if (reduced) return { mode: "fade" };
  return { mode: "move", scale: speed === "fast" ? FAST_MOTION_SCALE : 1 };
}

/** A base duration or delay in ms at the plan's scale. */
export function scaledMs(ms: number, scale: number): number {
  return Math.round(ms * scale);
}
