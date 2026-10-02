/**
 * Desktop board side panels: which column (left or right) each one sits in,
 * and in what order. Players drag a panel by its grip and drop it into either
 * column; the order is saved as a short string in the duel settings
 * (`panelLayout`, "" = the default layout) so it follows the account.
 */

export type PanelId =
  | "preview"
  | "recent"
  | "log"
  | "oppHand"
  | "turn"
  | "actions"
  | "hand"
  | "chat";

export type PanelColumn = "left" | "right";

export type PanelLayout = { left: PanelId[]; right: PanelId[] };

export const PANEL_LABELS: Record<PanelId, string> = {
  preview: "Card preview",
  recent: "Recent plays",
  log: "Battle log",
  oppHand: "Opponent hand",
  turn: "Turn and clocks",
  actions: "Actions",
  hand: "Hand (Grid)",
  chat: "Chat",
};

export const DEFAULT_PANEL_LAYOUT: PanelLayout = {
  left: ["preview", "recent", "log"],
  right: ["oppHand", "turn", "actions", "hand", "chat"],
};

const PANEL_IDS = [...DEFAULT_PANEL_LAYOUT.left, ...DEFAULT_PANEL_LAYOUT.right];

function defaultColumnOf(id: PanelId): PanelColumn {
  return DEFAULT_PANEL_LAYOUT.left.includes(id) ? "left" : "right";
}

/**
 * Read a saved layout. Unknown or repeated ids are dropped, and a panel the
 * string does not mention (an older save, a panel added later) goes back to
 * the end of its default column, so every panel always has a place.
 */
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
  for (const id of PANEL_IDS) if (!seen.has(id)) layout[defaultColumnOf(id)].push(id);
  return layout;
}

/** The saved form; the default layout saves as "" so a later default change reaches it. */
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

/**
 * Move `id` into `column`, just before `beforeId` (or to the end of the column
 * when null). Panels that are not on screen right now keep their places.
 */
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

export type PanelRect = { id: PanelId; column: PanelColumn; top: number; bottom: number };
export type ColumnRect = { left: number; right: number };

export type PanelDrop = { column: PanelColumn; beforeId: PanelId | null };

/**
 * Where a dragged panel lands for a pointer at (x, y): the column under the
 * pointer (or the nearer one, over the board), then before the first panel in
 * it whose middle is below the pointer, else at the end.
 */
export function panelDropAt(
  columns: Record<PanelColumn, ColumnRect>,
  panels: readonly PanelRect[],
  dragId: PanelId,
  x: number,
  y: number,
): PanelDrop {
  const dist = (c: ColumnRect) => (x < c.left ? c.left - x : x > c.right ? x - c.right : 0);
  const column: PanelColumn = dist(columns.left) <= dist(columns.right) ? "left" : "right";
  const inColumn = panels
    .filter((p) => p.column === column && p.id !== dragId)
    .sort((a, b) => a.top - b.top);
  const before = inColumn.find((p) => y < (p.top + p.bottom) / 2);
  return { column, beforeId: before?.id ?? null };
}

/**
 * Keyboard move on a panel's grip: Up / Down swap it with the visible panel
 * above / below, Left / Right send it to the end of that column.
 */
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
  // Down: land before the panel after the next one (or at the end).
  return movePanel(layout, id, column, shown[i + 2] ?? null);
}

export function samePanelLayout(a: PanelLayout, b: PanelLayout): boolean {
  return serializePanelLayoutRaw(a) === serializePanelLayoutRaw(b);
}

/**
 * The opponent's hand can also be pinned above the playmat, at its left,
 * centre or right ("" = in its side panel). Saved as `oppHandSpot`.
 */
export type MatSpot = "left" | "centre" | "right";
export type OppHandSpot = MatSpot | "";
export const OPP_HAND_SPOTS: readonly OppHandSpot[] = ["", "left", "centre", "right"];

export type MatRect = { left: number; right: number; top: number; bottom: number };

/**
 * The mat spot a dragged opponent hand lands on: over the top strip of the
 * playmat (its top fifth, or just above it), by thirds of its width. Null
 * anywhere else, so it goes back to a column.
 */
export function matSpotAt(mat: MatRect, x: number, y: number): MatSpot | null {
  if (x < mat.left || x > mat.right) return null;
  const band = (mat.bottom - mat.top) * 0.2;
  if (y < mat.top - band / 2 || y > mat.top + band) return null;
  const third = (mat.right - mat.left) / 3;
  if (x < mat.left + third) return "left";
  if (x > mat.right - third) return "right";
  return "centre";
}
