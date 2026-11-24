export const POPUP_SIZE_MIN = 70;
export const POPUP_SIZE_MAX = 160;
export const POPUP_SIZE_STEP = 10;
export const POPUP_SIZE_DEFAULT = 100;

export function clampPopupSize(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return POPUP_SIZE_DEFAULT;
  const stepped = Math.round(v / POPUP_SIZE_STEP) * POPUP_SIZE_STEP;
  return Math.max(POPUP_SIZE_MIN, Math.min(POPUP_SIZE_MAX, stepped));
}

export function stepPopupSize(current: number, dir: 1 | -1): number {
  return clampPopupSize(clampPopupSize(current) + dir * POPUP_SIZE_STEP);
}

export type PopupSizeKey = "popupSize" | "previewPopupSize";

export const POPUP_SCALE_VAR: Record<PopupSizeKey, string> = {
  popupSize: "--popup-scale",
  previewPopupSize: "--preview-popup-scale",
};

export function applyPopupSize(
  size: number,
  root: { style: { setProperty(name: string, value: string): void; removeProperty(name: string): void } } = document.documentElement,
  key: PopupSizeKey = "popupSize",
): void {
  const pct = clampPopupSize(size);
  if (pct === POPUP_SIZE_DEFAULT) root.style.removeProperty(POPUP_SCALE_VAR[key]);
  else root.style.setProperty(POPUP_SCALE_VAR[key], String(pct / 100));
}
