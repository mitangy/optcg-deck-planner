import type { Box } from "./battleArc";

export type PromptSide = "bottom" | "top";

function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Which end of the board column a centred effect prompt should sit at while a
 * battle is on. It rests at the bottom; if that would cover the card being hit
 * it moves to the top. The defender counts far more than the attacker (a
 * prompt may hide the attacker, never the target), and the bottom wins ties.
 * Boxes are viewport rects; `bottomTop` / `topTop` are the prompt's top edge in
 * each position.
 */
export function promptSide(o: {
  width: number;
  height: number;
  centerX: number;
  bottomTop: number;
  topTop: number;
  defender: Box | null;
  attacker: Box | null;
  /** Breathing room around the defender, so the prompt never touches it. */
  pad?: number;
}): PromptSide {
  const { defender, attacker, pad = 8 } = o;
  if (!defender) return "bottom";
  const padded: Box = {
    left: defender.left - pad,
    top: defender.top - pad,
    width: defender.width + pad * 2,
    height: defender.height + pad * 2,
  };
  const cost = (top: number): number => {
    const box: Box = { left: o.centerX - o.width / 2, top, width: o.width, height: o.height };
    return overlapArea(box, padded) * 1000 + (attacker ? overlapArea(box, attacker) : 0);
  };
  return cost(o.topTop) < cost(o.bottomTop) ? "top" : "bottom";
}
