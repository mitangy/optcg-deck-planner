/**
 * Where the desktop Game review panel floats (#986): a box the viewer drags by its header and resizes from its
 * edges, remembered between sessions. Pure helpers, so clamping and remembering are tested without a browser.
 * The box is kept as its top-left corner and size in viewport pixels and is clamped when drawn, never in
 * storage, so a window that grows again gives the remembered place back.
 *
 * (The Log Pose window keeps a bottom-right anchored position and fixed limits in `@optcg/analyst-client`
 * panelPos/panelSize, and the prompts keep a centre offset in `board/promptDrag`; neither fits a free box with its
 * own limits, so this is the small shared piece for a top-left box.)
 */
export type Rect = { x: number; y: number; w: number; h: number };
export type Size = { w: number; h: number };
export type Edge = "top" | "bottom" | "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

export const REVIEW_RECT_KEY = "optcg-duel:review-panel";
/** The smallest the panel goes (it keeps the header and a couple of rows) and the widest (rows stay readable). */
export const PANEL_MIN: Size = { w: 260, h: 200 };
export const PANEL_MAX_W = 720;
/** Gap kept to the viewport edges. */
export const PANEL_GAP = 8;
export const PANEL_KEY_STEP = 16;
export const PANEL_KEY_STEP_BIG = 64;

const clampDim = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

export type Limits = { vp: Size; /** The highest the top edge may go (below the top bar). */ top?: number };

/** The room the panel can use: the viewport less the gap, and below `top`. */
function room({ vp, top }: Limits): { left: number; top: number; right: number; bottom: number } {
  return { left: PANEL_GAP, top: Math.max(top ?? 0, PANEL_GAP), right: Math.max(vp.w - PANEL_GAP, PANEL_GAP), bottom: Math.max(vp.h - PANEL_GAP, PANEL_GAP) };
}

/** `rect` within the minimum and maximum size and entirely on screen (the room wins over the minimum on a tiny window). */
export function clampRect(rect: Rect, limits: Limits): Rect {
  const r = room(limits);
  const w = Math.round(clampDim(rect.w, PANEL_MIN.w, Math.min(PANEL_MAX_W, r.right - r.left)));
  const h = Math.round(clampDim(rect.h, PANEL_MIN.h, r.bottom - r.top));
  return {
    w,
    h,
    x: Math.round(clampDim(rect.x, r.left, Math.max(r.right - w, r.left))),
    y: Math.round(clampDim(rect.y, r.top, Math.max(r.bottom - h, r.top))),
  };
}

/** The box after dragging its header by (dx, dy) from `start`. */
export function moveRect(start: Rect, dx: number, dy: number, limits: Limits): Rect {
  return clampRect({ ...start, x: start.x + dx, y: start.y + dy }, limits);
}

/** The box after dragging `edge` by (dx, dy) from `start`: the edge opposite the dragged one stays where it is, even when a limit stops the drag. */
export function resizeRect(start: Rect, edge: Edge, dx: number, dy: number, limits: Limits): Rect {
  const r = room(limits);
  const maxW = Math.min(PANEL_MAX_W, r.right - r.left);
  let { x, y, w, h } = start;
  if (edge.includes("left")) {
    const right = start.x + start.w;
    w = clampDim(start.w - dx, PANEL_MIN.w, Math.min(maxW, right - r.left));
    x = right - w;
  }
  if (edge.includes("right")) w = clampDim(start.w + dx, PANEL_MIN.w, Math.min(maxW, r.right - start.x));
  if (edge.includes("top")) {
    const bottom = start.y + start.h;
    h = clampDim(start.h - dy, PANEL_MIN.h, bottom - r.top);
    y = bottom - h;
  }
  if (edge.includes("bottom")) h = clampDim(start.h + dy, PANEL_MIN.h, r.bottom - start.y);
  return clampRect({ x, y, w, h }, limits);
}

/** The arrow keys' direction as a (dx, dy) step; null for other keys. */
function arrow(key: string, big: boolean): [number, number] | null {
  const step = big ? PANEL_KEY_STEP_BIG : PANEL_KEY_STEP;
  const move = { ArrowUp: [0, -step], ArrowLeft: [-step, 0], ArrowDown: [0, step], ArrowRight: [step, 0] }[key];
  return (move as [number, number] | undefined) ?? null;
}

/** The box after an arrow key on the move grip (it goes the way the arrow points); null for other keys. */
export function keyMove(start: Rect, key: string, big: boolean, limits: Limits): Rect | null {
  const d = arrow(key, big);
  return d ? moveRect(start, d[0], d[1], limits) : null;
}

/** The box after an arrow key on an edge handle (arrows point the way the edge moves); null for a key across a side edge's own axis. */
export function keyResize(start: Rect, edge: Edge, key: string, big: boolean, limits: Limits): Rect | null {
  const d = arrow(key, big);
  if (!d) return null;
  const horizontal = edge.includes("left") || edge.includes("right");
  const vertical = edge.includes("top") || edge.includes("bottom");
  if ((d[0] && !horizontal) || (d[1] && !vertical)) return null;
  return resizeRect(start, edge, d[0], d[1], limits);
}

/** The least room above the anchor that is worth opening in (below that the panel opens beside it). */
export const PANEL_ABOVE_MIN_H = 320;

/**
 * Where the panel opens until it has been moved: above `anchor` (the replay controls), right-aligned with it, as tall
 * as `idealSize.h` allows; when there is too little room above (a short window), beside it on its left, full height.
 */
export function defaultRect(anchor: { top: number; left: number; right: number }, idealSize: Size, limits: Limits): Rect {
  const r = room(limits);
  const above = anchor.top - PANEL_GAP - r.top;
  if (above < PANEL_ABOVE_MIN_H) {
    return clampRect({ x: anchor.left - PANEL_GAP - idealSize.w, y: r.top, w: idealSize.w, h: idealSize.h }, limits);
  }
  const h = clampDim(idealSize.h, PANEL_MIN.h, above);
  return clampRect({ x: anchor.right - idealSize.w, y: anchor.top - PANEL_GAP - h, w: idealSize.w, h }, limits);
}

function parseRect(raw: string | null): Rect | null {
  try {
    const v = JSON.parse(raw ?? "null") as Partial<Record<keyof Rect, unknown>> | null;
    if (!v) return null;
    const ok = [v.x, v.y, v.w, v.h].every((n) => typeof n === "number" && Number.isFinite(n));
    return ok ? { x: v.x as number, y: v.y as number, w: v.w as number, h: v.h as number } : null;
  } catch {
    return null;
  }
}

export function readRect(): Rect | null {
  try {
    return parseRect(globalThis.localStorage?.getItem(REVIEW_RECT_KEY) ?? null);
  } catch {
    return null;
  }
}

/** Remembers the box; null forgets it (back to the docked default). */
export function writeRect(rect: Rect | null): void {
  try {
    if (rect) globalThis.localStorage?.setItem(REVIEW_RECT_KEY, JSON.stringify(rect));
    else globalThis.localStorage?.removeItem(REVIEW_RECT_KEY);
  } catch {
    /* storage blocked: the box just isn't remembered */
  }
}
