import { DEFAULT_PANEL_LAYOUT, type PanelColumn, type PanelId } from "./panelLayout";

export type PanelSizes = {
  widths: Partial<Record<PanelColumn, number>>;
  heights: Partial<Record<PanelId, number>>;
  cuts: Partial<Record<PanelColumn, number>>;
};

export const EMPTY_PANEL_SIZES: PanelSizes = { widths: {}, heights: {}, cuts: {} };

export const CUT_MIN = 0.18;
export const CUT_MAX = 0.6;
export const CUT_REMOVE_BELOW = 0.12;
export const CUT_STEP = 0.03;

export const COLUMN_MIN_PX = 180;
export const COLUMN_MAX_PX = 560;
export const COLUMN_MAX_VW = 34;
export const PANEL_MIN_PX = 72;
// Preview and Turn hold content that cannot scroll away.
export const PANEL_MIN_HEIGHT_PX: Record<PanelId, number> = {
  preview: 140,
  log: 96,
  oppHand: PANEL_MIN_PX,
  turn: PANEL_MIN_PX,
  hand: PANEL_MIN_PX,
  chat: 120,
  logpose: 340,
};
export const CONTENT_SIZED_PANELS: readonly PanelId[] = ["turn", "oppHand"];
export const PANEL_MIN_WIDTH_PX: Record<PanelId, number> = {
  preview: 200,
  log: 200,
  oppHand: 200,
  turn: 250,
  hand: 200,
  chat: 200,
  logpose: 320,
};
export const SHARE_MIN = 0.05;
export const SHARE_MAX = 0.95;
export const COLUMN_STEP_PX = 16;
export const PANEL_STEP_SHARE = 0.03;

const PANEL_IDS: readonly PanelId[] = [...DEFAULT_PANEL_LAYOUT.left, ...DEFAULT_PANEL_LAYOUT.right];

export function columnMaxPx(vw: number): number {
  return Math.max(COLUMN_MIN_PX, Math.min(COLUMN_MAX_PX, (vw * COLUMN_MAX_VW) / 100));
}

export function columnMinPx(ids: readonly PanelId[]): number {
  return Math.min(COLUMN_MAX_PX, Math.max(COLUMN_MIN_PX, ...ids.map((id) => PANEL_MIN_WIDTH_PX[id] ?? 0)));
}

export function clampColumnWidth(px: number, vw: number, min: number = COLUMN_MIN_PX): number {
  const lo = Math.max(COLUMN_MIN_PX, min);
  return Math.round(Math.min(Math.max(lo, columnMaxPx(vw)), Math.max(lo, px)));
}

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

export function cutFromPointer(clientY: number, vh: number): number | null {
  if (!(vh > 0)) return null;
  const share = (vh - clientY) / vh;
  return share < CUT_REMOVE_BELOW ? null : clampCut(share);
}

export function nudgeCut(cut: number | null, up: boolean): number | null {
  if (up) return clampCut((cut ?? CUT_MIN - CUT_STEP) + CUT_STEP);
  if (cut == null) return null;
  return cut - CUT_STEP < CUT_MIN - 1e-9 ? null : clampCut(cut - CUT_STEP);
}

export function clampShare(share: number): number {
  return Math.round(Math.min(SHARE_MAX, Math.max(SHARE_MIN, share)) * 1000) / 1000;
}

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

export function panelSizesForMode(big: boolean, normalSaved: string, bigSaved: string): PanelSizes {
  const normal = parsePanelSizes(normalSaved);
  return big ? { widths: parsePanelSizes(bigSaved).widths, heights: normal.heights, cuts: normal.cuts } : normal;
}

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
