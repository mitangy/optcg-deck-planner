// Stored as the player left it and clamped only when drawn, so a window that grows again gives the position back.
import type { Size } from "./panelSize";

export type Pos = { r: number; b: number };

export const POS_KEY = "optcg-logpose:pos";
export const POS_STEP = 16;
export const POS_STEP_BIG = 64;

const clampDim = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

export function clampPos(pos: Pos, size: Size, vp: Size): Pos {
  return {
    r: Math.round(clampDim(pos.r, 0, Math.max(vp.w - size.w, 0))),
    b: Math.round(clampDim(pos.b, 0, Math.max(vp.h - size.h, 0))),
  };
}

export function roomAt(vp: Size, pos: Pos | null): Size {
  return pos ? { w: Math.max(vp.w - pos.r, 0), h: Math.max(vp.h - pos.b, 0) } : vp;
}

export function dragPos(start: Pos, dx: number, dy: number, size: Size, vp: Size): Pos {
  return clampPos({ r: start.r - dx, b: start.b - dy }, size, vp);
}

export function keyPos(start: Pos, key: string, big: boolean, size: Size, vp: Size): Pos | null {
  const step = big ? POS_STEP_BIG : POS_STEP;
  const move = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[key];
  if (!move) return null;
  return clampPos({ r: start.r + move[0]!, b: start.b + move[1]! }, size, vp);
}

function parsePos(raw: string | null): Pos | null {
  try {
    const v = JSON.parse(raw ?? "null") as { r?: unknown; b?: unknown } | null;
    return v && Number.isFinite(v.r) && Number.isFinite(v.b) ? { r: Number(v.r), b: Number(v.b) } : null;
  } catch {
    return null;
  }
}

export function readPos(): Pos | null {
  try {
    return parsePos(globalThis.localStorage?.getItem(POS_KEY) ?? null);
  } catch {
    return null;
  }
}

export function writePos(pos: Pos | null): void {
  try {
    if (pos) globalThis.localStorage?.setItem(POS_KEY, JSON.stringify(pos));
    else globalThis.localStorage?.removeItem(POS_KEY);
  } catch {
    /* storage blocked: the position just isn't remembered */
  }
}
