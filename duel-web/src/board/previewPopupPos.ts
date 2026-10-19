export type PopupPos = { x: number; y: number };
export type PopupSize = { width: number; height: number };
export type Rect = { left: number; top: number; right: number; bottom: number };

/** Space kept between the pop-up and the card it steps aside from. */
export const POPUP_DODGE_GAP = 12;

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

/**
 * Step the pop-up sideways off the card being hovered (#583): it sits above the
 * play area now, so over that card it would catch the pointer and the card could
 * not be clicked. Not touching the card (with POPUP_DODGE_GAP around it) leaves
 * it where it is. Otherwise it goes left of the card if that fits, else right,
 * else to the side with more room, keeping its height.
 */
export function dodgePreviewPopup(pos: PopupPos, size: PopupSize, anchor: Rect, view: { width: number; height: number }): PopupPos {
  const g = POPUP_DODGE_GAP;
  const hits =
    pos.x < anchor.right + g &&
    pos.x + size.width > anchor.left - g &&
    pos.y < anchor.bottom + g &&
    pos.y + size.height > anchor.top - g;
  if (!hits) return pos;
  const left = anchor.left - g - size.width;
  const right = anchor.right + g;
  let x: number;
  if (left >= POPUP_EDGE) x = left;
  else if (right + size.width <= view.width - POPUP_EDGE) x = right;
  else x = anchor.left - POPUP_EDGE >= view.width - POPUP_EDGE - anchor.right ? left : right;
  return clampPreviewPopupPos({ x, y: pos.y }, size, view);
}
