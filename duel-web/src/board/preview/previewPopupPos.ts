export type PopupPos = { x: number; y: number };
export type PopupSize = { width: number; height: number };
export type Rect = { left: number; top: number; right: number; bottom: number };

export const POPUP_DODGE_GAP = 12;

export const POPUP_EDGE = 8;

export function parsePreviewPopupPos(s: string): PopupPos | null {
  const [x, y, ...rest] = s.split(",");
  if (y === undefined || rest.length > 0 || !x.trim() || !y.trim()) return null;
  const pos = { x: Number(x), y: Number(y) };
  return Number.isFinite(pos.x) && Number.isFinite(pos.y) ? pos : null;
}

export function serializePreviewPopupPos(pos: PopupPos): string {
  return `${Math.round(pos.x)},${Math.round(pos.y)}`;
}

export function clampPreviewPopupPos(pos: PopupPos, size: PopupSize, view: { width: number; height: number }): PopupPos {
  const clamp = (v: number, hi: number) => Math.max(POPUP_EDGE, Math.min(v, hi));
  return {
    x: clamp(pos.x, view.width - POPUP_EDGE - size.width),
    y: clamp(pos.y, view.height - POPUP_EDGE - size.height),
  };
}

// It sits above the play area, so over the hovered card it would catch the pointer and the card could not be clicked.
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
