/**
 * Your own hand order when "Sort hand" is off: dragging a hand card onto
 * another spot in the hand moves it there. The order lives on this device
 * only, as card instance ids, so it survives hand updates; cards that leave
 * drop out and new cards join at the end.
 */

/** Saved order kept where the cards are still in hand, then new cards in hand order. */
export function reconcileHandOrder(saved: readonly string[], handIds: readonly string[]): string[] {
  const inHand = new Set(handIds);
  const kept = saved.filter((id) => inHand.has(id));
  const seen = new Set(kept);
  return [...kept, ...handIds.filter((id) => !seen.has(id))];
}

/** `order` with `id` moved to `slot`, counted among the other cards. */
export function moveToSlot(order: readonly string[], id: string, slot: number): string[] {
  const others = order.filter((x) => x !== id);
  const at = Math.max(0, Math.min(slot, others.length));
  return [...others.slice(0, at), id, ...others.slice(at)];
}

export type SlotRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

/**
 * Where a card dropped at (x, y) lands among the other hand cards (their
 * rects, in display order). Cards are grouped into rows by their centre
 * height, so a fanned hand (arced, tilted) is one row and a wrapping grid
 * is several; the drop goes into the row nearest the pointer, before the
 * first card whose centre is right of it.
 */
export function handDropSlot(others: readonly SlotRect[], x: number, y: number): number {
  type Row = {
    start: number;
    cy: number;
    top: number;
    bottom: number;
    cxs: number[];
  };
  const rows: Row[] = [];
  others.forEach((r, i) => {
    const cy = (r.top + r.bottom) / 2;
    const cx = (r.left + r.right) / 2;
    const row = rows[rows.length - 1];
    if (row && Math.abs(cy - row.cy) < (r.bottom - r.top) / 2) {
      row.cxs.push(cx);
      row.top = Math.min(row.top, r.top);
      row.bottom = Math.max(row.bottom, r.bottom);
    } else {
      rows.push({ start: i, cy, top: r.top, bottom: r.bottom, cxs: [cx] });
    }
  });
  if (rows.length === 0) return 0;
  const dist = (row: Row) => (y < row.top ? row.top - y : y > row.bottom ? y - row.bottom : 0);
  let best = rows[0]!;
  for (const row of rows) if (dist(row) < dist(best)) best = row;
  const before = best.cxs.filter((cx) => cx < x).length;
  return best.start + before;
}
