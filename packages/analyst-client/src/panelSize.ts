import type { Pos } from "./panelPos";

export type Size = { w: number; h: number };
export type Edge = "top" | "bottom" | "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

export const MIN_W = 320;
export const MIN_H = 360;
export const MARGIN = 16;
export const SIZE_KEY = "optcg-logpose:size";
export const SHEET_KEY = "optcg-logpose:sheet";
export const SHEET_MIN = 0.45;
export const SNAP_FULL = 0.92;

const clampDim = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

export function maxSize(vp: Size): Size {
  return { w: Math.max(vp.w - MARGIN, 0), h: Math.max(vp.h - MARGIN, 0) };
}

export function clampSize(size: Size, vp: Size): Size {
  const max = maxSize(vp);
  return { w: Math.round(clampDim(size.w, MIN_W, max.w)), h: Math.round(clampDim(size.h, MIN_H, max.h)) };
}

export type Frame = { size: Size; pos: Pos };

// Anchored bottom-right: dragging the right or bottom edge also changes the gap to that viewport edge, which keeps the opposite edge where it is.
export function dragRect(start: Frame, edge: Edge, dx: number, dy: number, vp: Size): Frame {
  let { w, h } = start.size;
  let { r, b } = start.pos;
  if (edge.includes("left")) w = clampDim(start.size.w - dx, MIN_W, Math.max(vp.w - start.pos.r - MARGIN, 0));
  if (edge.includes("top")) h = clampDim(start.size.h - dy, MIN_H, Math.max(vp.h - start.pos.b - MARGIN, 0));
  if (edge.includes("right")) {
    w = clampDim(start.size.w + dx, MIN_W, start.size.w + start.pos.r);
    r = start.pos.r + start.size.w - w;
  }
  if (edge.includes("bottom")) {
    h = clampDim(start.size.h + dy, MIN_H, start.size.h + start.pos.b);
    b = start.pos.b + start.size.h - h;
  }
  return { size: { w: Math.round(w), h: Math.round(h) }, pos: { r: Math.round(r), b: Math.round(b) } };
}

export const KEY_STEP = 16;
export const KEY_STEP_BIG = 64;

export function keyRect(start: Frame, edge: Edge, key: string, big: boolean, vp: Size): Frame | null {
  const step = big ? KEY_STEP_BIG : KEY_STEP;
  const move = { ArrowUp: [0, -step], ArrowLeft: [-step, 0], ArrowDown: [0, step], ArrowRight: [step, 0] }[key];
  if (!move) return null;
  const [dx, dy] = move as [number, number];
  const horizontal = edge.includes("left") || edge.includes("right");
  const vertical = edge.includes("top") || edge.includes("bottom");
  if ((dx && !horizontal) || (dy && !vertical)) return null;
  return dragRect(start, edge, dx, dy, vp);
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

export function clampSheet(frac: number, snap = false): number {
  if (!Number.isFinite(frac)) return 1;
  const f = Math.min(Math.max(frac, SHEET_MIN), 1);
  return snap && f >= SNAP_FULL ? 1 : f;
}

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
