import type { Size } from "./panelSize";
import type { Pos } from "./panelPos";

export type Dock = "left" | "right" | null;
export type DockSide = Exclude<Dock, null>;

export const DOCK_EDGE = 24;
export const UNDOCK_DIST = 32;
export const DOCK_W_DEFAULT = 380;
export const DOCK_W_MIN = 320;
export const DOCK_W_MAX_SHARE = 0.5;
export const FLOAT_DEFAULT: Size = { w: 420, h: 600 };
export const DOCK_KEY = "optcg-logpose:dock";
export const DOCK_W_KEY = "optcg-logpose:dock-w";

export type DockSides = { left: boolean; right: boolean };

export type DockColumns = { left?: { left: number; right: number } | null; right?: { left: number; right: number } | null };

export function dockAt(x: number, vpW: number, columns?: DockColumns, sides?: DockSides): Dock {
  const side = dockUnder(x, vpW, columns);
  return side && sides && !sides[side] ? null : side;
}

function dockUnder(x: number, vpW: number, columns?: DockColumns): Dock {
  if (x <= DOCK_EDGE) return "left";
  if (x >= vpW - DOCK_EDGE) return "right";
  const over = (c?: { left: number; right: number } | null) => Boolean(c && x >= c.left && x <= c.right);
  if (over(columns?.left)) return "left";
  if (over(columns?.right)) return "right";
  return null;
}

// The saved side is never rewritten, so it comes back when its column does.
export function fitDock(dock: Dock, sides?: DockSides | null): Dock {
  if (!dock || !sides || sides[dock]) return dock;
  const other: DockSide = dock === "left" ? "right" : "left";
  return sides[other] ? other : null;
}

export function pulledLoose(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= UNDOCK_DIST;
}

export function clampDockW(w: number, vpW: number): number {
  const max = Math.max(Math.round(vpW * DOCK_W_MAX_SHARE), DOCK_W_MIN);
  return Math.round(Math.min(Math.max(Number.isFinite(w) ? w : DOCK_W_DEFAULT, DOCK_W_MIN), max));
}

export function dragDockW(start: number, side: DockSide, dx: number, vpW: number): number {
  return clampDockW(side === "right" ? start - dx : start + dx, vpW);
}

export function keyDock(dock: Dock, key: string, touches: { left: boolean; right: boolean }, sides?: DockSides): DockSide | "undock" | null {
  const act = keyDockUnfitted(dock, key, touches);
  return act === "left" || act === "right" ? (sides && !sides[act] ? null : act) : act;
}

function keyDockUnfitted(dock: Dock, key: string, touches: { left: boolean; right: boolean }): DockSide | "undock" | null {
  if (dock) return (dock === "right" && key === "ArrowLeft") || (dock === "left" && key === "ArrowRight") ? "undock" : null;
  if (key === "ArrowLeft" && touches.left) return "left";
  if (key === "ArrowRight" && touches.right) return "right";
  return null;
}

export function floatSize(remembered: Size | null, vp: Size): Size {
  const s = remembered ?? FLOAT_DEFAULT;
  return { w: Math.min(s.w, Math.max(vp.w - 16, 0)), h: Math.min(s.h, Math.max(vp.h - 16, 0)) };
}

export function looseAt(pointer: { x: number; y: number }, grab: { share: number; dy: number }, size: Size, vp: Size): Pos {
  const left = pointer.x - grab.share * size.w;
  const top = pointer.y - grab.dy;
  const clamp = (v: number, max: number) => Math.round(Math.min(Math.max(v, 0), Math.max(max, 0)));
  return { r: clamp(vp.w - left - size.w, vp.w - size.w), b: clamp(vp.h - top - size.h, vp.h - size.h) };
}

export function floatBeside(side: DockSide, size: Size, vp: Size, gap = 16): Pos {
  return { r: side === "right" ? gap : Math.max(vp.w - size.w - gap, 0), b: gap };
}

export function parseDock(raw: string | null | undefined): Dock {
  return raw === "left" || raw === "right" ? raw : null;
}

export function readDock(): Dock {
  try {
    return parseDock(globalThis.localStorage?.getItem(DOCK_KEY));
  } catch {
    return null;
  }
}

export function writeDock(dock: Dock): void {
  try {
    if (dock) globalThis.localStorage?.setItem(DOCK_KEY, dock);
    else globalThis.localStorage?.removeItem(DOCK_KEY);
  } catch {
    /* storage blocked: the side just isn't remembered */
  }
}

export function readDockW(): number {
  try {
    const raw = globalThis.localStorage?.getItem(DOCK_W_KEY);
    const n = raw === null || raw === undefined ? NaN : Number(raw);
    return Number.isFinite(n) ? Math.max(Math.round(n), DOCK_W_MIN) : DOCK_W_DEFAULT;
  } catch {
    return DOCK_W_DEFAULT;
  }
}

export function writeDockW(w: number): void {
  try {
    globalThis.localStorage?.setItem(DOCK_W_KEY, String(Math.round(w)));
  } catch {
    /* storage blocked */
  }
}
