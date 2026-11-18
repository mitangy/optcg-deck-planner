import type { PanelColumn } from "../panels/panelLayout";

export type FanCorner = {
  column: PanelColumn;
  cut: number;
};

export const CORNER_GAP_PX = 10;

export function fanCornerFor(s: {
  fan: boolean;
  spectatorFan: boolean;
  moved: boolean;
  cuts: Partial<Record<PanelColumn, number>>;
}): FanCorner | null {
  if (!s.fan || s.spectatorFan || s.moved) return null;
  for (const column of ["right", "left"] as const) {
    const cut = s.cuts[column];
    if (cut != null) return { column, cut };
  }
  return null;
}

export function cornerBounds(
  column: PanelColumn,
  mat: { left: number; right: number },
  viewportW: number,
): { left: number; right: number; width: number } {
  if (column === "right") {
    const left = Math.max(0, Math.round(mat.right + CORNER_GAP_PX));
    return { left, right: 0, width: Math.max(0, viewportW - left) };
  }
  const right = Math.max(0, Math.round(viewportW - (mat.left - CORNER_GAP_PX)));
  return { left: 0, right, width: Math.max(0, viewportW - right) };
}
