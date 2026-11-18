export type PanelId =
  | "preview"
  | "log"
  | "oppHand"
  | "turn"
  | "hand"
  | "chat"
  | "logpose";

export type PanelColumn = "left" | "right";

export type PanelLayout = { left: PanelId[]; right: PanelId[] };

export const PANEL_LABELS: Record<PanelId, string> = {
  preview: "Card preview",
  log: "Battle log",
  oppHand: "Opponent hand",
  turn: "Turn and clocks",
  hand: "Hand (Grid)",
  chat: "Chat",
  logpose: "Log Pose",
};

export const DEFAULT_PANEL_LAYOUT: PanelLayout = {
  left: ["preview", "log"],
  right: ["logpose", "oppHand", "turn", "hand", "chat"],
};

const PANEL_IDS = [...DEFAULT_PANEL_LAYOUT.left, ...DEFAULT_PANEL_LAYOUT.right];

function defaultColumnOf(id: PanelId): PanelColumn {
  return DEFAULT_PANEL_LAYOUT.left.includes(id) ? "left" : "right";
}

export function parsePanelLayout(saved: string): PanelLayout {
  if (!saved) return { left: [...DEFAULT_PANEL_LAYOUT.left], right: [...DEFAULT_PANEL_LAYOUT.right] };
  const [leftRaw = "", rightRaw = ""] = saved.split("|");
  const seen = new Set<PanelId>();
  const read = (raw: string) => {
    const out: PanelId[] = [];
    for (const part of raw.split(",")) {
      const id = part.trim() as PanelId;
      if (!PANEL_IDS.includes(id) || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  };
  const layout: PanelLayout = { left: read(leftRaw), right: read(rightRaw) };
  if (!seen.has("logpose")) {
    seen.add("logpose");
    layout[defaultColumnOf("logpose")].unshift("logpose");
  }
  for (const id of PANEL_IDS) if (!seen.has(id)) layout[defaultColumnOf(id)].push(id);
  return layout;
}

export function serializePanelLayout(layout: PanelLayout): string {
  const s = `${layout.left.join(",")}|${layout.right.join(",")}`;
  return s === serializePanelLayoutRaw(DEFAULT_PANEL_LAYOUT) ? "" : s;
}

function serializePanelLayoutRaw(layout: PanelLayout): string {
  return `${layout.left.join(",")}|${layout.right.join(",")}`;
}

export function columnOf(layout: PanelLayout, id: PanelId): PanelColumn {
  return layout.left.includes(id) ? "left" : "right";
}

export function movePanel(
  layout: PanelLayout,
  id: PanelId,
  column: PanelColumn,
  beforeId: PanelId | null,
): PanelLayout {
  if (beforeId === id) return layout;
  const next: PanelLayout = {
    left: layout.left.filter((p) => p !== id),
    right: layout.right.filter((p) => p !== id),
  };
  const list = next[column];
  const at = beforeId == null ? -1 : list.indexOf(beforeId);
  if (at < 0) list.push(id);
  else list.splice(at, 0, id);
  return next;
}

export function placeLogPose(layout: PanelLayout, side: PanelColumn | null): PanelLayout {
  if (side == null || layout[side].includes("logpose")) return layout;
  const other: PanelColumn = side === "left" ? "right" : "left";
  return { [side]: ["logpose", ...layout[side]], [other]: layout[other].filter((p) => p !== "logpose") } as PanelLayout;
}

export type PanelRect = { id: PanelId; column: PanelColumn; top: number; bottom: number };
export type ColumnRect = { left: number; right: number };

export type PanelDrop = { column: PanelColumn; beforeId: PanelId | null };

export function panelDropAt(
  columns: Partial<Record<PanelColumn, ColumnRect>>,
  panels: readonly PanelRect[],
  dragId: PanelId,
  x: number,
  y: number,
): PanelDrop {
  const dist = (c: ColumnRect | undefined) => (!c ? Infinity : x < c.left ? c.left - x : x > c.right ? x - c.right : 0);
  const column: PanelColumn = dist(columns.left) <= dist(columns.right) ? "left" : "right";
  const inColumn = panels
    .filter((p) => p.column === column && p.id !== dragId)
    .sort((a, b) => a.top - b.top);
  const before = inColumn.find((p) => y < (p.top + p.bottom) / 2);
  return { column, beforeId: before?.id ?? null };
}

export function nudgePanel(
  layout: PanelLayout,
  id: PanelId,
  dir: "up" | "down" | "left" | "right",
  visible: ReadonlySet<PanelId>,
): PanelLayout {
  const column = columnOf(layout, id);
  if (dir === "left" || dir === "right") {
    return dir === column ? layout : movePanel(layout, id, dir, null);
  }
  const shown = layout[column].filter((p) => visible.has(p) || p === id);
  const i = shown.indexOf(id);
  if (dir === "up") return i <= 0 ? layout : movePanel(layout, id, column, shown[i - 1]);
  if (i >= shown.length - 1) return layout;
  return movePanel(layout, id, column, shown[i + 2] ?? null);
}

export function collapsedColumns(
  shown: Record<PanelColumn, readonly PanelId[]>,
  dragging: boolean,
  busy: Partial<Record<PanelColumn, boolean>> = {},
): Record<PanelColumn, boolean> {
  const collapse = (c: PanelColumn) => !dragging && shown[c].length === 0 && !busy[c];
  return { left: collapse("left"), right: collapse("right") };
}

// The saved layout is never written from this, so the split comes back with "both".
export function mergeIntoColumn(layout: PanelLayout, side: PanelColumn): PanelLayout {
  const other: PanelColumn = side === "left" ? "right" : "left";
  return { [side]: [...layout[side], ...layout[other]], [other]: [] } as PanelLayout;
}

// Switching back to Both still gives two populated columns. A docked panel (Log Pose) must stay in `side`, so it pulls the cut down to just after it.
export function splitMergedLayout(next: PanelLayout, saved: PanelLayout, side: PanelColumn, docked?: PanelId): PanelLayout {
  const other: PanelColumn = side === "left" ? "right" : "left";
  const order = [...next[side], ...next[other]];
  const at = docked ? order.indexOf(docked) : -1;
  const keep = saved[side].length;
  const cut = Math.max(keep, at + 1);
  return { [side]: order.slice(0, cut), [other]: order.slice(cut) } as PanelLayout;
}

export function samePanelLayout(a: PanelLayout, b: PanelLayout): boolean {
  return serializePanelLayoutRaw(a) === serializePanelLayoutRaw(b);
}

export type MatSpot = "left" | "centre" | "right";
export type OppHandSpot = MatSpot | "";
export const OPP_HAND_SPOTS: readonly OppHandSpot[] = ["", "left", "centre", "right"];

export const MAT_SIDE_MIN_ASPECT = 1.02;

export type MatRect = { left: number; right: number; top: number; bottom: number };

export function matSpotAt(mat: MatRect, x: number, y: number, opp?: MatRect): MatSpot | null {
  if (x < mat.left || x > mat.right) return null;
  const band = (mat.bottom - mat.top) * 0.2;
  if (opp && y >= mat.top - band / 2 && y <= opp.bottom) {
    if (x < opp.left) return "left";
    if (x > opp.right) return "right";
  }
  if (y < mat.top - band / 2 || y > mat.top + band) return null;
  const third = (mat.right - mat.left) / 3;
  if (x < mat.left + third) return "left";
  if (x > mat.right - third) return "right";
  return "centre";
}
