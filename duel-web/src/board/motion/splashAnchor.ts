export type Box = { left: number; top: number; width: number; height: number };

export function splashAnchor(oppMat: Box | null): { x: number; y: number } | null {
  if (!oppMat || oppMat.width <= 0 || oppMat.height <= 0) return null;
  return { x: oppMat.left + oppMat.width / 2, y: oppMat.top + oppMat.height / 2 };
}

// Phones have no room on the opponent mat: the banner sits with its bottom edge on the line above the player mat, so it never covers the player side.
export function splashAnchorAboveMat(oppMat: Box | null, youMat: Box | null): { x: number; y: number } | null {
  if (!oppMat || !youMat || youMat.width <= 0 || youMat.height <= 0) return null;
  if (youMat.top < oppMat.top) return null;
  return { x: youMat.left + youMat.width / 2, y: youMat.top };
}
