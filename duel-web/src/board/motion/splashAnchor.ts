export type Box = { left: number; top: number; width: number; height: number };

export function splashAnchor(oppMat: Box | null): { x: number; y: number } | null {
  if (!oppMat || oppMat.width <= 0 || oppMat.height <= 0) return null;
  return { x: oppMat.left + oppMat.width / 2, y: oppMat.top + oppMat.height / 2 };
}
