/**
 * Text size setting. The page's root font size is (a fluid, window-based size) ×
 * --text-scale, so every rem-sized label grows with both the window and this
 * setting. Card badges also multiply their card-width-based size by it.
 * index.html mirrors this table to set the scale before first paint.
 */
import type { TextSize } from "./settings";

export const TEXT_SCALES: Record<TextSize, number> = {
  small: 0.9,
  medium: 1,
  large: 1.12,
  xlarge: 1.25,
};

/** Set (or, for the default, clear) --text-scale on the page root. */
export function applyTextSize(
  size: TextSize,
  root: { style: { setProperty(name: string, value: string): void; removeProperty(name: string): void } } = document.documentElement,
): void {
  const scale = TEXT_SCALES[size] ?? 1;
  if (scale === 1) root.style.removeProperty("--text-scale");
  else root.style.setProperty("--text-scale", String(scale));
}
