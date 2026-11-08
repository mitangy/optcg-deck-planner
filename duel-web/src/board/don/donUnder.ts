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
