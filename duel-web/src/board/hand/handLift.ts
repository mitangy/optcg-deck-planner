export const CARRY_WIDTH_PX = 64;
export const LIFT_SCALE = 1.08;
export const MAX_TILT_DEG = 12;
const TILT_PER_SPEED = 10;

export function liftScale(overHand: boolean, cardWidth: number): number {
  if (overHand || cardWidth <= 0) return LIFT_SCALE;
  return Math.min(LIFT_SCALE, CARRY_WIDTH_PX / cardWidth);
}

export function liftTilt(vx: number): number {
  const deg = vx * TILT_PER_SPEED;
  return Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, deg));
}
