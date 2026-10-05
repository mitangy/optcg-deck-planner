/**
 * Where the "Back to …" pill goes in the desktop top bar: as near the centre of
 * the board column as it can get while clearing the status chips on its left
 * and the buttons on its right. Returns its left edge, or null when the gap is
 * too narrow for it (the pill then falls back to floating under the bar).
 */
export function peekPillLeft(
  gap: { from: number; to: number },
  pillWidth: number,
  centre: number,
): number | null {
  if (gap.to - gap.from < pillWidth) return null;
  return Math.min(Math.max(centre - pillWidth / 2, gap.from), gap.to - pillWidth);
}
