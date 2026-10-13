/** The Pop-up size setting: every in-game pop-up's size as a percent of its normal size. */
export const POPUP_SIZE_MIN = 70;
export const POPUP_SIZE_MAX = 160;
export const POPUP_SIZE_STEP = 10;
export const POPUP_SIZE_DEFAULT = 100;

/** A saved size forced into range and onto a step; anything unreadable is the default. */
export function clampPopupSize(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return POPUP_SIZE_DEFAULT;
  const stepped = Math.round(v / POPUP_SIZE_STEP) * POPUP_SIZE_STEP;
  return Math.max(POPUP_SIZE_MIN, Math.min(POPUP_SIZE_MAX, stepped));
}

/** One step bigger (+1) or smaller (-1), stopping at the bounds. */
export function stepPopupSize(current: number, dir: 1 | -1): number {
  return clampPopupSize(clampPopupSize(current) + dir * POPUP_SIZE_STEP);
}

/** The two size settings: every pop-up but the hover card, and the hover card on its own (#572). */
export type PopupSizeKey = "popupSize" | "previewPopupSize";

/** The page-root variable each size setting writes (1 = 100%). */
export const POPUP_SCALE_VAR: Record<PopupSizeKey, string> = {
  popupSize: "--popup-scale",
  previewPopupSize: "--preview-popup-scale",
};

/** Set (or, for 100%, clear) a size variable on the page root, where every pop-up (portals included) reads it. */
export function applyPopupSize(
  size: number,
  root: { style: { setProperty(name: string, value: string): void; removeProperty(name: string): void } } = document.documentElement,
  key: PopupSizeKey = "popupSize",
): void {
  const pct = clampPopupSize(size);
  if (pct === POPUP_SIZE_DEFAULT) root.style.removeProperty(POPUP_SCALE_VAR[key]);
  else root.style.setProperty(POPUP_SCALE_VAR[key], String(pct / 100));
}
