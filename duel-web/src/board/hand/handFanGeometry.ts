import type { CSSProperties } from "react";

export const FAN_STEP_DEG = 5;
export const FAN_MAX_SPREAD_DEG = 30;
const FAN_RADIUS = 3;

export type FanPose = {
  rot: number;
  drop: number;
};

export function fanPose(i: number, n: number): FanPose {
  if (n <= 1) return { rot: 0, drop: 0 };
  const k = i - (n - 1) / 2;
  const step = Math.min(FAN_STEP_DEG, FAN_MAX_SPREAD_DEG / (n - 1));
  const rot = k * step;
  const drop = FAN_RADIUS * (1 - Math.cos((rot * Math.PI) / 180));
  return { rot, drop };
}

export function fanPoseStyle(i: number, n: number): CSSProperties {
  const p = fanPose(i, n);
  return { "--rot": `${p.rot.toFixed(2)}deg`, "--drop": p.drop.toFixed(4) } as CSSProperties;
}

export const FAN_MIN_STEP = 0.22;

// Each card still shows its cost and power at FAN_MIN_STEP, so a huge hand runs a little wide rather than stacking up unreadable.
export function fanSpan(count: number, cardW: number, spread: number, maxW: number | null): number {
  const n = Math.max(count, 1);
  const natural = cardW * (spread * (n - 1) + 1);
  if (maxW == null) return natural;
  const floor = cardW * (FAN_MIN_STEP * (n - 1) + 1);
  return Math.min(natural, Math.max(maxW, floor));
}

export type HandDrawer = "open" | "tucked" | "hidden";

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
