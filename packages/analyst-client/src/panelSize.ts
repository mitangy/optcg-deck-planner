/**
 * How big the Log Pose panel is. Desktop and tablets (fine pointer or width of 640px and up) get a
 * window anchored to the bottom-right corner that is resized from its top edge, left edge or top-left
 * corner; phones get a sheet whose height is a share of the screen, changed by dragging its grab handle.
 * Pure helpers, so clamping and remembering are tested without a browser.
 */

export type Size = { w: number; h: number };
export type Edge = "top" | "left" | "corner";

export const MIN_W = 320;
export const MIN_H = 360;
/** Space kept free at the top and left of the viewport. */
export const MARGIN = 16;
export const SIZE_KEY = "optcg-logpose:size";
export const SHEET_KEY = "optcg-logpose:sheet";
/** The phone sheet is never lower than this share of the screen, and snaps to full height above SNAP_FULL. */
export const SHEET_MIN = 0.45;
export const SNAP_FULL = 0.92;

/** Within min..max; when the room is smaller than the minimum the room wins. */
const clampDim = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/** The largest panel: the viewport less the margin on its free sides. */
export function maxSize(vp: Size): Size {
  return { w: Math.max(vp.w - MARGIN, 0), h: Math.max(vp.h - MARGIN, 0) };
}

/** `size` within the minimum and the viewport maximum (the minimum gives way when the viewport is smaller). */
export function clampSize(size: Size, vp: Size): Size {
  const max = maxSize(vp);
  return { w: Math.round(clampDim(size.w, MIN_W, max.w)), h: Math.round(clampDim(size.h, MIN_H, max.h)) };
}

/**
 * The size after dragging an edge by (dx, dy) from `start`. The panel stays anchored bottom-right, so pulling
 * the top edge up (negative dy) makes it taller and pulling the left edge left (negative dx) makes it wider.
 */
export function dragSize(start: Size, edge: Edge, dx: number, dy: number, vp: Size): Size {
  return clampSize({ w: edge === "top" ? start.w : start.w - dx, h: edge === "left" ? start.h : start.h - dy }, vp);
}

export const KEY_STEP = 16;
export const KEY_STEP_BIG = 64;

/** The size after an arrow key on a handle (arrows point the way the edge moves); null for keys it doesn't use. */
export function keySize(start: Size, edge: Edge, key: string, big: boolean, vp: Size): Size | null {
  const step = big ? KEY_STEP_BIG : KEY_STEP;
  const grow = { ArrowUp: [0, step], ArrowLeft: [step, 0], ArrowDown: [0, -step], ArrowRight: [-step, 0] }[key];
  if (!grow) return null;
  const [dw, dh] = grow as [number, number];
  if ((edge === "top" && dw) || (edge === "left" && dh)) return null;
  return clampSize({ w: start.w + dw, h: start.h + dh }, vp);
}

function parseSize(raw: string | null): Size | null {
  try {
    const v = JSON.parse(raw ?? "null") as { w?: unknown; h?: unknown } | null;
    return v && Number.isFinite(v.w) && Number.isFinite(v.h) ? { w: Number(v.w), h: Number(v.h) } : null;
  } catch {
    return null;
  }
}

export function readSize(): Size | null {
  try {
    return parseSize(globalThis.localStorage?.getItem(SIZE_KEY) ?? null);
  } catch {
    return null;
  }
}

export function writeSize(size: Size | null): void {
  try {
    if (size) globalThis.localStorage?.setItem(SIZE_KEY, JSON.stringify(size));
    else globalThis.localStorage?.removeItem(SIZE_KEY);
  } catch {
    /* storage blocked: the size just isn't remembered */
  }
}

/** The phone sheet's height as a share of the screen: within SHEET_MIN..1, snapping to 1 near the top. */
export function clampSheet(frac: number, snap = false): number {
  if (!Number.isFinite(frac)) return 1;
  const f = Math.min(Math.max(frac, SHEET_MIN), 1);
  return snap && f >= SNAP_FULL ? 1 : f;
}

/** The share after dragging the grab handle from `startY` to `y` (up makes the sheet taller) on a screen `screenH` tall. */
export function dragSheet(startFrac: number, startY: number, y: number, screenH: number): number {
  return screenH > 0 ? clampSheet(startFrac + (startY - y) / screenH) : 1;
}

export function readSheet(): number {
  try {
    const raw = globalThis.localStorage?.getItem(SHEET_KEY);
    return raw === null || raw === undefined ? 1 : clampSheet(Number(raw));
  } catch {
    return 1;
  }
}

export function writeSheet(frac: number): void {
  try {
    if (frac >= 1) globalThis.localStorage?.removeItem(SHEET_KEY);
    else globalThis.localStorage?.setItem(SHEET_KEY, String(Math.round(frac * 1000) / 1000));
  } catch {
    /* storage blocked */
  }
}
