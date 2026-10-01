import type { ChoiceRequestView } from "../net/protocol";

/**
 * Pure helpers for the floating-card prompts (`FloatingPrompt.tsx`): cards laid
 * out left → right over the board, tapped to pick and dragged to reorder.
 * Mirrors duel-web/src/board/floatOrder.ts.
 */

/** `list` with `id` moved to `index` (clamped); unchanged when `id` is absent. */
export function moveId(list: readonly string[], id: string, index: number): string[] {
  if (!list.includes(id)) return [...list];
  const rest = list.filter((x) => x !== id);
  rest.splice(Math.max(0, Math.min(index, rest.length)), 0, id);
  return rest;
}

/**
 * Tap-to-sequence: tapping an unnumbered card gives it the next number and
 * slides it into that slot of the row; tapping a numbered card clears its
 * number (later numbers close the gap, the row stays as it is).
 */
export function tapInOrder(
  order: readonly string[],
  tapped: readonly string[],
  id: string,
): { order: string[]; tapped: string[] } {
  if (tapped.includes(id)) return { order: [...order], tapped: tapped.filter((x) => x !== id) };
  const nextTapped = [...tapped, id];
  return { order: moveId(order, id, nextTapped.length - 1), tapped: nextTapped };
}

/** Index of the slot whose center is closest to (x, y). */
export function nearestSlot(centers: readonly { x: number; y: number }[], x: number, y: number): number {
  let best = 0;
  let bestD = Infinity;
  centers.forEach((c, i) => {
    const d = (c.x - x) ** 2 + (c.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/**
 * Answer for a floated look (search) prompt. The row reads top of deck → bottom
 * of deck, so the cards left behind go back in row order. "Top or bottom"
 * sends them all to the same side: every card on top, or none.
 */
export function floatLookAnswer(
  request: Extract<ChoiceRequestView, { type: "look" }>,
  row: readonly string[],
  picked: readonly string[],
  side: "top" | "bottom",
): { selectedOptionIds: string[]; orderedOptionIds: string[]; topOptionIds?: string[] } {
  const remaining = row.filter((id) => !picked.includes(id));
  return {
    selectedOptionIds: [...picked],
    orderedOptionIds: remaining,
    ...(request.rest === "top_or_bottom" ? { topOptionIds: side === "top" ? [...remaining] : [] } : {}),
  };
}

/** Caption under each floating card (name + step buttons). */
export const FLOAT_CAPTION_H = 36;

/** Card width and cards per row for `count` cards in a `width` × `height` window. */
export function floatCardSize(count: number, width: number, height: number): { perRow: number; cardW: number } {
  const portrait = height >= width;
  const perRow = portrait && count > 3 ? 3 : Math.max(1, count);
  const rows = Math.ceil(count / perRow);
  const gap = 8;
  // Header, step buttons, note and actions take about 300px (150px in landscape,
  // where the title and prompt share one line and the note is hidden).
  const chrome = portrait ? 300 : 150;
  const fitW = (width - 32 - gap * (perRow - 1)) / perRow;
  const fitH = ((height - chrome) / rows - FLOAT_CAPTION_H) * 0.716;
  return { perRow, cardW: Math.max(56, Math.floor(Math.min(fitW, fitH, 170))) };
}
