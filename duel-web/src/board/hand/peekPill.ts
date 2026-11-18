export function peekPillLeft(
  gap: { from: number; to: number },
  pillWidth: number,
  centre: number,
): number | null {
  if (gap.to - gap.from < pillWidth) return null;
  return Math.min(Math.max(centre - pillWidth / 2, gap.from), gap.to - pillWidth);
}
