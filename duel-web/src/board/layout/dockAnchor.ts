export type Rect = { left: number; top: number; width: number; height: number };

export type DockAnchor = { x: number; y: number };

export function dockAnchor(
  midline: Rect | null,
  limits: (Rect | null)[],
  margin = 10,
): DockAnchor | null {
  if (!midline || midline.width === 0) return null;
  let right = midline.left + midline.width;
  for (const r of limits) if (r) right = Math.min(right, r.left + r.width);
  return { x: right - margin, y: midline.top + midline.height / 2 };
}

export function stripReserve(midline: Rect, anchorX: number, dockWidth: number, gap = 12): number {
  return midline.left + midline.width - (anchorX - dockWidth) + gap;
}

export function sameAnchor(a: DockAnchor | null, b: DockAnchor | null): boolean {
  if (!a || !b) return a === b;
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
}
