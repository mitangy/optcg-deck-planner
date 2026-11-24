import type { TextSize } from "./settings";

export const TEXT_SCALES: Record<TextSize, number> = {
  small: 0.9,
  medium: 1,
  large: 1.12,
  xlarge: 1.25,
};

export function applyTextSize(
  size: TextSize,
  root: { style: { setProperty(name: string, value: string): void; removeProperty(name: string): void } } = document.documentElement,
): void {
  const scale = TEXT_SCALES[size] ?? 1;
  if (scale === 1) root.style.removeProperty("--text-scale");
  else root.style.setProperty("--text-scale", String(scale));
}
