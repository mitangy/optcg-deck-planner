import type { Size } from "./panelSize";

export type Rect = { left: number; top: number; width: number; height: number };

export const COMPASS_SIZE = 52;
export const COMPASS_GAP = 16;
export const POP_MS = 200;
export const POP_SCALE = 0.08;

export function compassRect(vp: Size): Rect {
  return { left: vp.w - COMPASS_GAP - COMPASS_SIZE, top: vp.h - COMPASS_GAP - COMPASS_SIZE, width: COMPASS_SIZE, height: COMPASS_SIZE };
}

export function growOrigin(compass: Rect, panel: Rect): { x: number; y: number } {
  return { x: compass.left + compass.width / 2 - panel.left, y: compass.top + compass.height / 2 - panel.top };
}

export function popFrames(opening: boolean): Keyframe[] {
  const small = { transform: `scale(${POP_SCALE})`, opacity: 0 };
  const full = { transform: "scale(1)", opacity: 1 };
  return opening ? [small, full] : [full, small];
}

export function slideFrames(side: "left" | "right", opening: boolean): Keyframe[] {
  const away = { transform: `translateX(${side === "right" ? 28 : -28}px)`, opacity: 0 };
  const here = { transform: "translateX(0)", opacity: 1 };
  return opening ? [away, here] : [here, away];
}
