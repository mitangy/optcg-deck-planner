/**
 * The fanned hand in the corner (#633). A desktop player can shorten a side
 * column from its bottom edge (`panelSizes` cuts); the hand then sits in the
 * corner that frees, fully shown, instead of rising over the board.
 */
import type { PanelColumn } from "./panelLayout";

export type FanCorner = {
  /** The shortened column the hand sits under. */
  column: PanelColumn;
  /** Share (0..1) of the window height the corner is tall. */
  cut: number;
};

/** Gap (px) between the board's edge and the corner's hand. */
export const CORNER_GAP_PX = 10;

/**
 * The corner the player's fan uses, or null for the usual spot. It needs the
 * fan in its default place (a moved fan keeps wherever it was put), a player's
 * hand (spectator fans have their own spots) and a column that is on screen and
 * cut. With both cut, the right one wins.
 */
export function fanCornerFor(s: {
  fan: boolean;
  spectatorFan: boolean;
  /** The fan was dragged somewhere (handFanPos is set). */
  moved: boolean;
  /** Per column: the saved cut, only for a column that is on screen. */
  cuts: Partial<Record<PanelColumn, number>>;
}): FanCorner | null {
  if (!s.fan || s.spectatorFan || s.moved) return null;
  for (const column of ["right", "left"] as const) {
    const cut = s.cuts[column];
    if (cut != null) return { column, cut };
  }
  return null;
}

/**
 * Where the corner's hand spans, from your mat's edge to the screen edge on the
 * column's side (so it also covers the gutter under the End turn button):
 * `left` / `right` are its distances from the window's left / right edge.
 */
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
