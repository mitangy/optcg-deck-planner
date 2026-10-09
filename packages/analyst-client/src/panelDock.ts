/**
 * Docking the Log Pose window to a side of the screen. Pure helpers (where the pointer docks, which arrow key
 * docks or undocks, how wide a docked panel may be, and what is remembered) so they are tested without a browser.
 * Outside a game a docked panel is a full-height strip at that edge; in a game it sits in the board's side column.
 */
import type { Size } from "./panelSize";
import type { Pos } from "./panelPos";

export type Dock = "left" | "right" | null;
export type DockSide = Exclude<Dock, null>;

/** How close to the screen's left or right edge the pointer must be for a drag to dock. */
export const DOCK_EDGE = 24;
/** How far the header of a docked panel is dragged before it comes loose. */
export const UNDOCK_DIST = 32;
export const DOCK_W_DEFAULT = 380;
export const DOCK_W_MIN = 320;
/** The widest a docked panel gets, as a share of the window. */
export const DOCK_W_MAX_SHARE = 0.5;
/** The window a panel gets when it comes loose and has no remembered size. */
export const FLOAT_DEFAULT: Size = { w: 420, h: 600 };
export const DOCK_KEY = "optcg-logpose:dock";
export const DOCK_W_KEY = "optcg-logpose:dock-w";

export type DockColumns = { left?: { left: number; right: number } | null; right?: { left: number; right: number } | null };

/**
 * The side a drag docks to: the pointer within DOCK_EDGE of that screen edge, or over a board column (`columns`,
 * the game's left and right columns). Null otherwise.
 */
export function dockAt(x: number, vpW: number, columns?: DockColumns): Dock {
  if (x <= DOCK_EDGE) return "left";
  if (x >= vpW - DOCK_EDGE) return "right";
  const over = (c?: { left: number; right: number } | null) => Boolean(c && x >= c.left && x <= c.right);
  if (over(columns?.left)) return "left";
  if (over(columns?.right)) return "right";
  return null;
}

/** Whether a drag of (dx, dy) on a docked panel's header is far enough to undock it. */
export function pulledLoose(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= UNDOCK_DIST;
}

/** The width of a docked panel within DOCK_W_MIN and half the window (the minimum gives way when the window is smaller). */
export function clampDockW(w: number, vpW: number): number {
  const max = Math.max(Math.round(vpW * DOCK_W_MAX_SHARE), DOCK_W_MIN);
  return Math.round(Math.min(Math.max(Number.isFinite(w) ? w : DOCK_W_DEFAULT, DOCK_W_MIN), max));
}

/** The width after dragging a docked panel's inner edge by `dx`: a right dock widens leftwards, a left dock rightwards. */
export function dragDockW(start: number, side: DockSide, dx: number, vpW: number): number {
  return clampDockW(side === "right" ? start - dx : start + dx, vpW);
}

/**
 * What an arrow key on the move grip does about docking: "left" / "right" docks (the key points at the edge the
 * window already touches), "undock" lets a docked panel go (the key points away from its edge), null leaves
 * the key to plain moving.
 */
export function keyDock(dock: Dock, key: string, touches: { left: boolean; right: boolean }): DockSide | "undock" | null {
  if (dock) return (dock === "right" && key === "ArrowLeft") || (dock === "left" && key === "ArrowRight") ? "undock" : null;
  if (key === "ArrowLeft" && touches.left) return "left";
  if (key === "ArrowRight" && touches.right) return "right";
  return null;
}

/** The window a panel becomes when it is undocked: the remembered size (or the default), clamped to the screen. */
export function floatSize(remembered: Size | null, vp: Size): Size {
  const s = remembered ?? FLOAT_DEFAULT;
  return { w: Math.min(s.w, Math.max(vp.w - 16, 0)), h: Math.min(s.h, Math.max(vp.h - 16, 0)) };
}

/**
 * Where the header grab lands when a docked panel comes loose: the window keeps the pointer at the same share of
 * its width, and the same distance below the top. `pos` is the gap to the right and bottom edges.
 */
export function looseAt(pointer: { x: number; y: number }, grab: { share: number; dy: number }, size: Size, vp: Size): Pos {
  const left = pointer.x - grab.share * size.w;
  const top = pointer.y - grab.dy;
  const clamp = (v: number, max: number) => Math.round(Math.min(Math.max(v, 0), Math.max(max, 0)));
  return { r: clamp(vp.w - left - size.w, vp.w - size.w), b: clamp(vp.h - top - size.h, vp.h - size.h) };
}

/** A window set just in from the edge it was docked to, for the keyboard undock. */
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
