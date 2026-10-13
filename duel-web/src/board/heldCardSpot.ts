import type { Box } from "./battleArc";

const BUBBLE_GAP = 8;
const CARD_LIFT = 12;

export type HeldSpot = {
  /** Viewport y of the held card's bottom edge (the stack grows upward from it). */
  bottom: number;
  /** Space between the question bubble and the card. */
  gap: number;
  /** How far the card is held up from its slot (negative = up). */
  lift: number;
};

/**
 * Where the held card and its question sit. Normally the card is held 12px up
 * from the hand slot it was played from. When that would put it over the hand's
 * header row (Hand / Sort / Hide on a phone), the card stays below the header
 * instead and the bubble moves above it, so the header buttons stay clear.
 */
export function heldCardSpot(
  anchor: Box,
  header: { left: number; right: number; top: number; bottom: number } | null,
): HeldSpot {
  const plain = { bottom: anchor.top + anchor.height, gap: BUBBLE_GAP, lift: -CARD_LIFT };
  if (!header) return plain;
  const overlapsX = anchor.left < header.right && anchor.left + anchor.width > header.left;
  if (!overlapsX || anchor.top - CARD_LIFT >= header.bottom) return plain;
  const top = Math.max(anchor.top, header.bottom);
  return { bottom: top + anchor.height, gap: header.bottom - header.top + BUBBLE_GAP, lift: 0 };
}

/**
 * Keeps the held stack on screen vertically. `bottom` is where the stack's
 * bottom edge was measured (the hand can be tucked partly below the viewport at
 * that moment), `lift` how far the card is held up from it (negative = up), and
 * `stackHeight` the bubble plus gap plus card. The card's visible bottom
 * (bottom + lift) stays `edge` above the viewport's bottom, then the stack's top
 * stays `edge` below the viewport's top. If both cannot hold, the top wins so
 * the question and its buttons stay reachable.
 */
export function clampHeldBottom(
  bottom: number,
  lift: number,
  stackHeight: number,
  viewportHeight: number,
  edge = 8,
): number {
  const lowest = Math.min(bottom, viewportHeight - edge - lift);
  return Math.max(lowest, edge + stackHeight);
}
