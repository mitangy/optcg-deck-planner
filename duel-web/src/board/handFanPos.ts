/**
 * Where the desktop fanned hand sits. Players drag it by its grip anywhere on
 * the screen; the spot is saved in the duel settings (`handFanPos`) as
 * "x,y": x is the fan's centre and y its bottom edge, both as a share of the
 * window, so it lands in the same place on another window size. "" is the
 * default: bottom centre of the board, which keeps a strip free under the
 * board for the tucked cards.
 *
 * A fan on the bottom edge (y = 1) still tucks away and rises on hover; one
 * dropped higher up floats fully shown.
 */

export type FanPos = { x: number; y: number };

/** Snap distance (px): to the bottom edge, and back to the default spot. */
export const FAN_SNAP_PX = 48;

/** The saved spot, or null for the default (bottom centre of the board). */
export function parseFanPos(saved: string): FanPos | null {
  const m = /^(-?[\d.]+),(-?[\d.]+)$/.exec(saved.trim());
  if (!m) return null;
  const x = Number(m[1]);
  const y = Number(m[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: clamp01(x), y: clamp01(y) };
}

export function serializeFanPos(pos: FanPos | null): string {
  if (!pos) return "";
  return `${round(pos.x)},${round(pos.y)}`;
}

/** On the bottom edge: the fan tucks and rises like the default one. */
export function fanDocked(pos: FanPos): boolean {
  return pos.y >= 1;
}

export type Viewport = { width: number; height: number };

/**
 * The spot to save for a fan dropped with its centre at `centreX` and its
 * bottom edge at `bottom` (viewport px). Near the default spot it goes back
 * to the default; near the bottom edge it snaps onto it.
 */
export function fanPosForDrop(
  centreX: number,
  bottom: number,
  vp: Viewport,
  defaultCentreX: number,
): FanPos | null {
  const nearBottom = vp.height - bottom <= FAN_SNAP_PX;
  if (nearBottom && Math.abs(centreX - defaultCentreX) <= FAN_SNAP_PX) return null;
  return {
    x: clamp01(centreX / vp.width),
    y: nearBottom ? 1 : clamp01(bottom / vp.height),
  };
}

/** Arrow keys on the grip: a small step, leaving the bottom edge on Up. */
export function nudgeFanPos(
  pos: FanPos,
  dir: "up" | "down" | "left" | "right",
  step = 0.03,
): FanPos {
  if (dir === "left") return { ...pos, x: clamp01(pos.x - step) };
  if (dir === "right") return { ...pos, x: clamp01(pos.x + step) };
  if (dir === "up") return { ...pos, y: clamp01(pos.y - step) };
  // Down: onto the bottom edge once within a step of it.
  return { ...pos, y: pos.y + step >= 1 - step / 2 ? 1 : pos.y + step };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
