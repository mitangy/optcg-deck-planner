import type { CSSProperties } from "react";

export const DON_UNDER_MAX_LAYERS = 5;

export type DonUnderLayer = {
  dx: number;
  dy: number;
};

// Step shrinks as layers are added so the whole fan stays about a quarter card deep.
const STEP_SCALE = [0, 1, 0.9, 0.75, 0.62, 0.52];

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

// A rested card's fan reaches much farther sideways (its tall side turns sideways) than a standing one, so where they point at each other the rested one goes under.
// Standing cards use the upper band (n + 1 .. 2n), rested ones the lower (1 .. n).
export function donFanOrder(index: number, count: number, rested: boolean): CSSProperties {
  const band = rested ? 0 : count;
  return {
    "--fan-z-next": band + index + 1,
    "--fan-z-prev": band + count - index,
    "--fan-z-top": 2 * count + 1,
  } as CSSProperties;
}
