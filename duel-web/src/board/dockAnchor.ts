export type Rect = { left: number; top: number; width: number; height: number };

export type DockAnchor = { x: number; y: number };

/**
 * Where the floating primary control sits: its right edge on the right edge of
 * the mat (inset by `margin`), vertically centred on the midline strip, so it
 * hugs the board whichever way the playmat is tilted. All rects come from
 * getBoundingClientRect, which already includes the tilt's projection. The strip
 * can be wider than the mats (flat) or narrower (tilted, far from the viewer):
 * the anchor takes the tightest right edge of the strip and every `limits` rect
 * (your side field, the playmat).
 */
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

/**
 * How much of the midline strip's right side the dock covers: from the dock's
 * left edge (its right edge is the anchor, `dockWidth` wide) to the strip's
 * right edge, plus a gap. The strip can run past the mat the dock hugs, so
 * this is more than the dock's own width on a flat board at small sizes.
 */
export function stripReserve(midline: Rect, anchorX: number, dockWidth: number, gap = 12): number {
  return midline.left + midline.width - (anchorX - dockWidth) + gap;
}

export function sameAnchor(a: DockAnchor | null, b: DockAnchor | null): boolean {
  if (!a || !b) return a === b;
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
}
