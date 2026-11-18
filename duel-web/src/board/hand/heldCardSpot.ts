import type { Box } from "../combat/battleArc";

const BUBBLE_GAP = 8;
const CARD_LIFT = 12;

export type HeldSpot = {
  bottom: number;
  gap: number;
  lift: number;
};

// When the held card would cover the hand's header row (phone), it stays below the header and the bubble moves above it, so the header buttons stay clear.
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

// If both cannot hold, the top wins so the question and its buttons stay reachable.
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
