export type PopupPos = { x: number; y: number };
export type PopupSize = { width: number; height: number };

/** Keep the card preview pop-up this far inside the window edge. */
export const POPUP_EDGE = 8;

/** The saved `previewPopupPos` ("x,y" px of the pop-up's top-left); "" or anything unreadable is the default spot (null). */
export function parsePreviewPopupPos(s: string): PopupPos | null {
  const [x, y, ...rest] = s.split(",");
  if (y === undefined || rest.length > 0 || !x.trim() || !y.trim()) return null;
  const pos = { x: Number(x), y: Number(y) };
  return Number.isFinite(pos.x) && Number.isFinite(pos.y) ? pos : null;
}

export function serializePreviewPopupPos(pos: PopupPos): string {
  return `${Math.round(pos.x)},${Math.round(pos.y)}`;
}

/**
 * Keep the whole pop-up on screen (POPUP_EDGE from each side). A pop-up bigger
 * than the window keeps its top-left corner on screen.
 */
export function clampPreviewPopupPos(pos: PopupPos, size: PopupSize, view: { width: number; height: number }): PopupPos {
  const clamp = (v: number, hi: number) => Math.max(POPUP_EDGE, Math.min(v, hi));
  return {
    x: clamp(pos.x, view.width - POPUP_EDGE - size.width),
    y: clamp(pos.y, view.height - POPUP_EDGE - size.height),
  };
}
