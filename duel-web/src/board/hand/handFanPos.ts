export type FanPos = { x: number; y: number };

export const FAN_SNAP_PX = 48;

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

export function fanDocked(pos: FanPos): boolean {
  return pos.y >= 1;
}

export type Viewport = { width: number; height: number };

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

// Spectator fans never tuck, so the bottom edge only means "home".
export function spectatorNearFanPosForDrop(centreX: number, bottom: number, vp: Viewport): FanPos | null {
  if (vp.height - bottom <= FAN_SNAP_PX) return null;
  return { x: clamp01(centreX / vp.width), y: clamp01(bottom / vp.height) };
}

export function farFanPosForDrop(
  centreX: number,
  bottom: number,
  height: number,
  vp: Viewport,
  matTop: number,
): FanPos | null {
  const top = bottom - height;
  if (top - matTop <= FAN_SNAP_PX) return null;
  return { x: clamp01(centreX / vp.width), y: clamp01(bottom / vp.height) };
}

export function nudgeFanPos(
  pos: FanPos,
  dir: "up" | "down" | "left" | "right",
  step = 0.03,
): FanPos {
  if (dir === "left") return { ...pos, x: clamp01(pos.x - step) };
  if (dir === "right") return { ...pos, x: clamp01(pos.x + step) };
  if (dir === "up") return { ...pos, y: clamp01(pos.y - step) };
  return { ...pos, y: pos.y + step >= 1 - step / 2 ? 1 : pos.y + step };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
