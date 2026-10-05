export type Box = { left: number; top: number; width: number; height: number };

/**
 * Where the centre of a desktop turn banner goes: the middle of the
 * opponent's mat. The midline (End turn dock, battle strip), your mat and
 * your hand all stay clear. null when the mat could not be measured (the
 * banner keeps its centre-of-board spot from board.css).
 */
export function splashAnchor(oppMat: Box | null): { x: number; y: number } | null {
  if (!oppMat || oppMat.width <= 0 || oppMat.height <= 0) return null;
  return { x: oppMat.left + oppMat.width / 2, y: oppMat.top + oppMat.height / 2 };
}
