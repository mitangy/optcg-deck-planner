/**
 * Desktop side panel sizes: how wide each column is and how tall each panel
 * is. Players drag the edge of a column or the divider between two panels; the
 * result is saved as a short string in the duel settings (`panelSizes`,
 * "" = every default) so it follows the account.
 *
 * Format: `L=260;R=340;RC=0.28;preview=0.45,log=0.3` - column widths in px,
 * the corner each column frees below it (`LC` / `RC`, share of the window
 * height), then each panel's share (0..1) of its column's height.
 */
import { DEFAULT_PANEL_LAYOUT, type PanelColumn, type PanelId } from "./panelLayout";

export type PanelSizes = {
  /** Column widths in px; a missing one keeps the board's default width. */
  widths: Partial<Record<PanelColumn, number>>;
  /** Share (0..1) of the column height; a missing one keeps the panel's CSS height. */
  heights: Partial<Record<PanelId, number>>;
  /**
   * Share (0..1) of the window height a column leaves free below it (#633): the
   * column is shortened from its bottom edge and the fanned hand sits in the
   * corner. A missing one is a full-height column.
   */
  cuts: Partial<Record<PanelColumn, number>>;
};

export const EMPTY_PANEL_SIZES: PanelSizes = { widths: {}, heights: {}, cuts: {} };

/** The least and the most of the window a corner may free; a drag below CUT_REMOVE_BELOW removes the cut. */
export const CUT_MIN = 0.18;
export const CUT_MAX = 0.6;
export const CUT_REMOVE_BELOW = 0.12;
/** Arrow-key step for the column's bottom handle (share of the window height). */
export const CUT_STEP = 0.03;

/** Narrowest a column drags to, and the widest (also capped to a third of the window). */
export const COLUMN_MIN_PX = 180;
export const COLUMN_MAX_PX = 560;
export const COLUMN_MAX_VW = 34;
/** A panel never drags smaller than this (4.5rem), or its own CSS minimum when larger. */
export const PANEL_MIN_PX = 72;
/**
 * The least height each panel keeps, whatever its saved share. Preview and Turn
 * hold content that cannot scroll away, so they get more than the generic floor;
 * the content-sized panels (below) also never drop under their natural height.
 */
export const PANEL_MIN_HEIGHT_PX: Record<PanelId, number> = {
  preview: 140,
  recent: PANEL_MIN_PX,
  log: 96,
  oppHand: PANEL_MIN_PX,
  turn: PANEL_MIN_PX,
  hand: PANEL_MIN_PX,
  // Its header and input row (about 5.4rem) plus a line or two of messages.
  chat: 120,
  // The docked Log Pose panel: header, a few lines of chat and the composer (board.css gives it the same floor).
  logpose: 340,
};
/** Panels that size to their content (never shrink below it). */
export const CONTENT_SIZED_PANELS: readonly PanelId[] = ["turn", "oppHand"];
/** The narrowest each panel reads at: the Turn panel's four stat columns need the most. */
export const PANEL_MIN_WIDTH_PX: Record<PanelId, number> = {
  preview: 200,
  recent: 200,
  log: 200,
  oppHand: 200,
  turn: 250,
  hand: 200,
  chat: 200,
  // Its header (title, actions) stays on one row from 320px.
  logpose: 320,
};
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

/**
 * The narrowest a column drags to: the widest minimum among the panels now in it.
 * The column also holds slots that are not movable panels (the action buttons, the
 * defend tray); they have no entry and count for nothing (#556).
 */
export function columnMinPx(ids: readonly PanelId[]): number {
  return Math.min(COLUMN_MAX_PX, Math.max(COLUMN_MIN_PX, ...ids.map((id) => PANEL_MIN_WIDTH_PX[id] ?? 0)));
}

export function clampColumnWidth(px: number, vw: number, min: number = COLUMN_MIN_PX): number {
  const lo = Math.max(COLUMN_MIN_PX, min);
  return Math.round(Math.min(Math.max(lo, columnMaxPx(vw)), Math.max(lo, px)));
}

/**
 * The least height a panel may take in a split: its floor, its CSS minimum and,
 * for a content-sized panel, the height its content needs (`natural`).
 */
export function panelMinHeight(id: PanelId, cssMin: number, natural: number): number {
  return Math.max(
    PANEL_MIN_HEIGHT_PX[id],
    Number.isFinite(cssMin) ? cssMin : 0,
    CONTENT_SIZED_PANELS.includes(id) ? Math.ceil(natural) : 0,
  );
}

export function clampCut(share: number): number {
  return Math.round(Math.min(CUT_MAX, Math.max(CUT_MIN, share)) * 1000) / 1000;
}

/**
 * The cut for a bottom edge dragged to `clientY` in a window `vh` tall: the room
 * below the pointer, clamped, or null (no cut) once it is dragged back near the bottom.
 */
export function cutFromPointer(clientY: number, vh: number): number | null {
  if (!(vh > 0)) return null;
  const share = (vh - clientY) / vh;
  return share < CUT_REMOVE_BELOW ? null : clampCut(share);
}

/** Keyboard step: Up frees more room (the first press creates the smallest cut), Down frees less and removes the cut under the minimum. */
export function nudgeCut(cut: number | null, up: boolean): number | null {
  if (up) return clampCut((cut ?? CUT_MIN - CUT_STEP) + CUT_STEP);
  if (cut == null) return null;
  return cut - CUT_STEP < CUT_MIN - 1e-9 ? null : clampCut(cut - CUT_STEP);
}

export function clampShare(share: number): number {
  return Math.round(Math.min(SHARE_MAX, Math.max(SHARE_MIN, share)) * 1000) / 1000;
}

/**
 * Read a saved string. Junk, unknown panel ids and out-of-range values are
 * dropped, so a hand-edited or newer save never breaks the board.
 */
export function parsePanelSizes(saved: string): PanelSizes {
  const out: PanelSizes = { widths: {}, heights: {}, cuts: {} };
  if (!saved) return out;
  for (const token of saved.split(";")) {
    const t = token.trim();
    const cut = /^([LR])C=(\d*\.?\d+)$/.exec(t);
    if (cut) {
      const share = Number(cut[2]);
      if (share > 0 && share <= 1) out.cuts[cut[1] === "L" ? "left" : "right"] = clampCut(share);
      continue;
    }
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
  if (sizes.cuts.left != null) parts.push(`LC=${clampCut(sizes.cuts.left)}`);
  if (sizes.cuts.right != null) parts.push(`RC=${clampCut(sizes.cuts.right)}`);
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
export function nudgeColumnWidth(width: number, grow: boolean, vw: number, min: number = COLUMN_MIN_PX): number {
  return clampColumnWidth(width + (grow ? COLUMN_STEP_PX : -COLUMN_STEP_PX), vw, min);
}

export function setWidth(sizes: PanelSizes, column: PanelColumn, px: number | null): PanelSizes {
  const widths = { ...sizes.widths };
  if (px == null) delete widths[column];
  else widths[column] = px;
  return { ...sizes, widths };
}

export function setCut(sizes: PanelSizes, column: PanelColumn, cut: number | null): PanelSizes {
  const cuts = { ...sizes.cuts };
  if (cut == null) delete cuts[column];
  else cuts[column] = clampCut(cut);
  return { ...sizes, cuts };
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

/**
 * The sizes the board uses. Bigger playing area keeps its own column widths
 * (`panelSizesBig`, its widths only) so turning it on still gives narrow
 * columns; panel heights and the corner cuts are shared with the normal layout.
 */
export function panelSizesForMode(big: boolean, normalSaved: string, bigSaved: string): PanelSizes {
  const normal = parsePanelSizes(normalSaved);
  return big ? { widths: parsePanelSizes(bigSaved).widths, heights: normal.heights, cuts: normal.cuts } : normal;
}

/** The settings to save after a drag in the current mode; the other mode's widths stay as they were. */
export function panelSizesPatch(
  big: boolean,
  next: PanelSizes,
  normalSaved: string,
): { panelSizes: string; panelSizesBig?: string } {
  if (!big) return { panelSizes: serializePanelSizes(next) };
  return {
    panelSizes: serializePanelSizes({ widths: parsePanelSizes(normalSaved).widths, heights: next.heights, cuts: next.cuts }),
    panelSizesBig: serializePanelSizes({ widths: next.widths, heights: {}, cuts: {} }),
  };
}
