/**
 * The panel's pop out of and shrink into the compass launcher. Pure helpers (where the grow starts, the frames)
 * so they are tested without a browser; LogPose.tsx plays them with the Web Animations API.
 */
import type { Size } from "./panelSize";

export type Rect = { left: number; top: number; width: number; height: number };

/** The compass launcher's size and gap to the corner (kept in step with .lp-compass in logPose.css). */
export const COMPASS_SIZE = 52;
export const COMPASS_GAP = 16;
export const POP_MS = 200;
export const POP_SCALE = 0.08;

/** Where the compass sits, bottom-right: used when it is not on screen (a board hides it; it is gone while the panel is open). */
export function compassRect(vp: Size): Rect {
  return { left: vp.w - COMPASS_GAP - COMPASS_SIZE, top: vp.h - COMPASS_GAP - COMPASS_SIZE, width: COMPASS_SIZE, height: COMPASS_SIZE };
}

/** The transform origin that puts the panel's scale-up on the compass centre: that centre, relative to the panel's top-left. */
export function growOrigin(compass: Rect, panel: Rect): { x: number; y: number } {
  return { x: compass.left + compass.width / 2 - panel.left, y: compass.top + compass.height / 2 - panel.top };
}

/** Keyframes for the panel growing out of (open) or shrinking into (close) its origin. */
export function popFrames(opening: boolean): Keyframe[] {
  const small = { transform: `scale(${POP_SCALE})`, opacity: 0 };
  const full = { transform: "scale(1)", opacity: 1 };
  return opening ? [small, full] : [full, small];
}

/** A docked panel slides in from, and back out to, its screen edge. */
export function slideFrames(side: "left" | "right", opening: boolean): Keyframe[] {
  const away = { transform: `translateX(${side === "right" ? 28 : -28}px)`, opacity: 0 };
  const here = { transform: "translateX(0)", opacity: 1 };
  return opening ? [away, here] : [here, away];
}
