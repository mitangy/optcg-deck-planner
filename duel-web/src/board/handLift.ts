/**
 * A hand card being dragged lifts out of the hand and rides under the pointer
 * (#357): full size, tilting with the motion, over the hand; shrunk to a
 * carried thumbnail once it leaves the hand so the board stays visible.
 */

/** Width of the carried card away from the hand (matches the old drag ghost). */
export const CARRY_WIDTH_PX = 64;
/** Grown a touch while it is held over the hand, like a card picked up. */
export const LIFT_SCALE = 1.08;
/** Strongest lean while it moves sideways. */
export const MAX_TILT_DEG = 12;
/** Degrees of lean per px/ms of sideways speed. */
const TILT_PER_SPEED = 10;

/** Scale for the lifted card: picked-up size over the hand, thumbnail size away from it. */
export function liftScale(overHand: boolean, cardWidth: number): number {
  if (overHand || cardWidth <= 0) return LIFT_SCALE;
  return Math.min(LIFT_SCALE, CARRY_WIDTH_PX / cardWidth);
}

/** Lean toward the direction of travel (px/ms sideways), capped; still = upright. */
export function liftTilt(vx: number): number {
  const deg = vx * TILT_PER_SPEED;
  return Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, deg));
}
