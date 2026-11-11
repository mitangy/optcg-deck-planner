import type { CSSProperties } from "react";

/** Most DON!! layers drawn peeking out from under a card (the count badge covers the rest). */
export const DON_UNDER_MAX_LAYERS = 5;

export type DonUnderLayer = {
  /** Offset right of the card, as a percent of the card width. */
  dx: number;
  /** Offset below the card, as a percent of the card height. */
  dy: number;
};

/** Step shrinks as layers are added so the whole fan stays about a quarter card deep. */
const STEP_SCALE = [0, 1, 0.9, 0.75, 0.62, 0.52];

/**
 * Offsets for the DON!! cards fanned out from under a Leader / Character, one
 * per attached DON!! up to {@link DON_UNDER_MAX_LAYERS}, nearest first. Spacing
 * tightens as the count grows.
 */
export function donUnderLayers(attached: number): DonUnderLayer[] {
  const n = Math.min(Math.max(0, Math.floor(attached)), DON_UNDER_MAX_LAYERS);
  const k = STEP_SCALE[n] ?? 0.5;
  return Array.from({ length: n }, (_, i) => ({
    dx: round1(6 * k * (i + 1)),
    dy: round1(9 * k * (i + 1)),
  }));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * Stacking slots for a Character in the field row, so DON!! fanned out from
 * under one card slides under its neighbour instead of over it. donUnder.css
 * picks one per tile:
 * - `--fan-z-top` (2n + 1): no DON!! under it, so it covers any neighbour's fan.
 * - `--fan-z-next` / `--fan-z-prev`: a card whose DON!! fans toward the next /
 *   previous card in the row sits under that card. Standing cards use the
 *   upper band (n + 1 .. 2n) and rested ones the lower band (1 .. n): a rested
 *   card's fan reaches sideways much farther (its tall side turns sideways),
 *   while a standing card's short fan never crosses the margin a rested
 *   neighbour keeps, so where the two point at each other the rested one goes under.
 */
export function donFanOrder(index: number, count: number, rested: boolean): CSSProperties {
  const band = rested ? 0 : count;
  return {
    "--fan-z-next": band + index + 1,
    "--fan-z-prev": band + count - index,
    "--fan-z-top": 2 * count + 1,
  } as CSSProperties;
}
