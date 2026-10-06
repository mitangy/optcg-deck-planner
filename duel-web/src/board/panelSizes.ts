/**
 * Desktop side panel sizes: how wide each column is and how tall each panel
 * is. Players drag the edge of a column or the divider between two panels; the
 * result is saved as a short string in the duel settings (`panelSizes`,
 * "" = every default) so it follows the account.
 *
 * Format: `L=260;R=340;preview=0.45,log=0.3` - column widths in px, then each
 * panel's share (0..1) of its column's height.
 */
import { DEFAULT_PANEL_LAYOUT, type PanelColumn, type PanelId } from "./panelLayout";

export type PanelSizes = {
  /** Column widths in px; a missing one keeps the board's default width. */
  widths: Partial<Record<PanelColumn, number>>;
  /** Share (0..1) of the column height; a missing one keeps the panel's CSS height. */
  heights: Partial<Record<PanelId, number>>;
};

export const EMPTY_PANEL_SIZES: PanelSizes = { widths: {}, heights: {} };

/** Narrowest a column drags to, and the widest (also capped to a third of the window). */
export const COLUMN_MIN_PX = 180;
export const COLUMN_MAX_PX = 560;
export const COLUMN_MAX_VW = 34;
/** A panel never drags smaller than this (4.5rem), or its own CSS minimum when larger. */
export const PANEL_MIN_PX = 72;
export const SHARE_MIN = 0.05;
export const SHARE_MAX = 0.95;
/** Arrow-key steps: px for a column, a share of the column for a divider. */
export const COLUMN_STEP_PX = 16;
export const PANEL_STEP_SHARE = 0.03;

const PANEL_IDS: readonly PanelId[] = [...DEFAULT_PANEL_LAYOUT.left, ...DEFAULT_PANEL_LAYOUT.right];

/** The widest a column may be in a window `vw` px wide. */
export function columnMaxPx(vw: number): number {
  return Math.max(COLUMN_MIN_PX, Math.min(COLUMN_MAX_PX, (vw * COLUMN_MAX_VW) / 100));
}

export function clampColumnWidth(px: number, vw: number): number {
  return Math.round(Math.min(columnMaxPx(vw), Math.max(COLUMN_MIN_PX, px)));
}

export function clampShare(share: number): number {
  return Math.round(Math.min(SHARE_MAX, Math.max(SHARE_MIN, share)) * 1000) / 1000;
}

/**
 * Read a saved string. Junk, unknown panel ids and out-of-range values are
 * dropped, so a hand-edited or newer save never breaks the board.
 */
export function parsePanelSizes(saved: string): PanelSizes {
  const out: PanelSizes = { widths: {}, heights: {} };
  if (!saved) return out;
  for (const token of saved.split(";")) {
    const t = token.trim();
    const col = /^([LR])=(\d+(?:\.\d+)?)$/.exec(t);
    if (col) {
      const px = Number(col[2]);
      if (px >= COLUMN_MIN_PX && px <= COLUMN_MAX_PX) out.widths[col[1] === "L" ? "left" : "right"] = px;
      continue;
    }
    for (const part of t.split(",")) {
      const m = /^(\w+)=(\d*\.?\d+)$/.exec(part.trim());
      if (!m) continue;
      const id = m[1] as PanelId;
      const share = Number(m[2]);
      if (PANEL_IDS.includes(id) && share >= SHARE_MIN && share <= SHARE_MAX) out.heights[id] = share;
    }
  }
  return out;
}

/** The saved form; no sizes at all saves as "" so a later default change reaches it. */
export function serializePanelSizes(sizes: PanelSizes): string {
  const parts: string[] = [];
  if (sizes.widths.left != null) parts.push(`L=${Math.round(sizes.widths.left)}`);
  if (sizes.widths.right != null) parts.push(`R=${Math.round(sizes.widths.right)}`);
  const heights = PANEL_IDS.filter((id) => sizes.heights[id] != null).map(
    (id) => `${id}=${clampShare(sizes.heights[id]!)}`,
  );
  if (heights.length) parts.push(heights.join(","));
  return parts.join(";");
}

export function samePanelSizes(a: PanelSizes, b: PanelSizes): boolean {
  return serializePanelSizes(a) === serializePanelSizes(b);
}

/**
 * Move `delta` px of height from one neighbour to the other (positive grows the
 * panel above). The pair's total never changes and neither goes under its
 * minimum; when the two minimums do not even fit, nothing moves.
 */
export function splitHeights(
  hA: number,
  hB: number,
  delta: number,
  minA: number,
  minB: number,
): [number, number] {
  const total = hA + hB;
  if (minA + minB > total) return [hA, hB];
  const a = Math.min(total - minB, Math.max(minA, hA + delta));
  return [a, total - a];
}

/** Keyboard step for a column handle: `grow` widens the column. */
export function nudgeColumnWidth(width: number, grow: boolean, vw: number): number {
  return clampColumnWidth(width + (grow ? COLUMN_STEP_PX : -COLUMN_STEP_PX), vw);
}

export function setWidth(sizes: PanelSizes, column: PanelColumn, px: number | null): PanelSizes {
  const widths = { ...sizes.widths };
  if (px == null) delete widths[column];
  else widths[column] = px;
  return { ...sizes, widths };
}

export function setShares(
  sizes: PanelSizes,
  shares: Partial<Record<PanelId, number | null>>,
): PanelSizes {
  const heights = { ...sizes.heights };
  for (const [id, share] of Object.entries(shares) as [PanelId, number | null][]) {
    if (share == null) delete heights[id];
    else heights[id] = clampShare(share);
  }
  return { ...sizes, heights };
}
