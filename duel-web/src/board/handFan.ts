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

/** Share of a card's width that each card in a crowded fan keeps showing, at least. */
export const FAN_MIN_STEP = 0.22;

/**
 * Width of the box a fan of `count` cards of width `cardW` takes: each card
 * after the first adds `spread` of a card width (0.5 tucked, 0.8 raised), so
 * a big hand grows past the board. It is capped at `maxW` (the mat), which
 * overlaps the cards more instead. A hand too big even for that stops
 * compressing at `FAN_MIN_STEP` (each card still shows its cost and power)
 * and runs a little wide rather than stacking up unreadable. `maxW` null is
 * no cap (the mat could not be measured).
 */
export function fanSpan(count: number, cardW: number, spread: number, maxW: number | null): number {
  const n = Math.max(count, 1);
  const natural = cardW * (spread * (n - 1) + 1);
  if (maxW == null) return natural;
  const floor = cardW * (FAN_MIN_STEP * (n - 1) + 1);
  return Math.min(natural, Math.max(maxW, floor));
}

/** Where the desktop hand (fan or corner dock) sits. */
export type HandDrawer = "open" | "tucked" | "hidden";

/**
 * Raised, tucked (peeking, raised on hover) or hidden (only its handle shows;
 * hover does not raise it). Hiding is the Keep hand open escape hatch (H), so
 * it wins over the pin and a selected card, but never over the mulligan or an
 * effect asking you to pick cards from your hand, where you have to see it.
 */
export function handDrawer(s: {
  pinned: boolean;
  hidden: boolean;
  mulligan: boolean;
  selected: boolean;
  picking?: boolean;
}): HandDrawer {
  if (s.mulligan || s.picking) return "open";
  if (s.hidden) return "hidden";
  return s.pinned || s.selected ? "open" : "tucked";
}
