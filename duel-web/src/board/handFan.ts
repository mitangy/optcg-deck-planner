/**
 * Pose of each card in a fanned hand, like cards held in one hand: the middle
 * card stands straight, outer cards lean out and sit a little lower on an arc.
 */

/** Tilt between neighbouring cards in a small hand (degrees). */
export const FAN_STEP_DEG = 5;
/** Tilt between the two outermost cards, whatever the hand size (degrees). */
export const FAN_MAX_SPREAD_DEG = 30;
/** Radius of the arc the card bottoms sit on, in card heights. */
const FAN_RADIUS = 3;

export type FanPose = {
  /** Clockwise tilt in degrees (negative leans left). */
  rot: number;
  /** How far the card sits below the middle one, in card heights. */
  drop: number;
};

/** Pose of card `i` (0-based, left to right) in a hand of `n`. */
export function fanPose(i: number, n: number): FanPose {
  if (n <= 1) return { rot: 0, drop: 0 };
  const k = i - (n - 1) / 2;
  const step = Math.min(FAN_STEP_DEG, FAN_MAX_SPREAD_DEG / (n - 1));
  const rot = k * step;
  const drop = FAN_RADIUS * (1 - Math.cos((rot * Math.PI) / 180));
  return { rot, drop };
}
