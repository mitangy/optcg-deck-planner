import type { ChoiceRequestView } from "../net/protocol";

export function moveId(list: readonly string[], id: string, index: number): string[] {
  if (!list.includes(id)) return [...list];
  const rest = list.filter((x) => x !== id);
  rest.splice(Math.max(0, Math.min(index, rest.length)), 0, id);
  return rest;
}

export function tapInOrder(
  order: readonly string[],
  tapped: readonly string[],
  id: string,
): { order: string[]; tapped: string[] } {
  if (tapped.includes(id)) return { order: [...order], tapped: tapped.filter((x) => x !== id) };
  const nextTapped = [...tapped, id];
  return { order: moveId(order, id, nextTapped.length - 1), tapped: nextTapped };
}

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

export const FLOAT_CAPTION_H = 36;

export function floatCardSize(count: number, width: number, height: number): { perRow: number; cardW: number } {
  const portrait = height >= width;
  const perRow = portrait && count > 3 ? 3 : Math.max(1, count);
  const rows = Math.ceil(count / perRow);
  const gap = 8;
  const chrome = portrait ? 300 : 150;
  const fitW = (width - 32 - gap * (perRow - 1)) / perRow;
  const fitH = ((height - chrome) / rows - FLOAT_CAPTION_H) * 0.716;
  return { perRow, cardW: Math.max(56, Math.floor(Math.min(fitW, fitH, 170))) };
}
