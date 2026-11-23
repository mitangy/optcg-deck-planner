import type { GroupBuyDetail, GroupBuyLine, GroupBuyOrder, GroupBuyOrderLine } from "../../api";
import { lineArtUrl } from "./useGroupBuyLines";

export type PackageCounts = { arrived: number; onTheWay: number; notOrdered: number };

/** Copies by where they are: in the box, shipped but not here, or not bought from any seller yet. */
export function packageCounts(lines: GroupBuyLine[], mine = false): PackageCounts {
  const c: PackageCounts = { arrived: 0, onTheWay: 0, notOrdered: 0 };
  for (const l of lines) {
    const inOrder = (mine ? l.my_in_order : l.in_order) ?? 0;
    const arrived = (mine ? l.my_arrived : l.arrived) ?? 0;
    c.arrived += arrived;
    c.onTheWay += Math.max(0, inOrder - arrived);
    c.notOrdered += (mine ? l.my_not_ordered : l.not_ordered) ?? 0;
  }
  return c;
}

export function countsTotal(c: PackageCounts): number {
  return c.arrived + c.onTheWay + c.notOrdered;
}

/** The three words under the progress bar. Zero counts stay so the line keeps its shape. */
export function progressLabels(c: PackageCounts): string[] {
  return [`${c.arrived} arrived`, `${c.onTheWay} on the way`, `${c.notOrdered} not in an order yet`];
}

export type ChipTone = "done" | "way" | "none" | "mixed";

/** One card's status chip. A single state is a word; a mix lists the counts. Never colour alone. */
export function cardStatus(c: PackageCounts, sellers: string[] = []): { label: string; tone: ChipTone } | null {
  const total = countsTotal(c);
  if (total <= 0) return null;
  if (c.arrived === total) return { label: "Arrived", tone: "done" };
  if (c.onTheWay === total) return { label: sellers.length ? `On the way · ${sellers.join(", ")}` : "On the way", tone: "way" };
  if (c.notOrdered === total) return { label: "Not in an order yet", tone: "none" };
  const parts = [
    c.arrived > 0 ? `${c.arrived} arrived` : "",
    c.onTheWay > 0 ? `${c.onTheWay} on the way` : "",
    c.notOrdered > 0 ? `${c.notOrdered} not ordered` : "",
  ].filter(Boolean);
  return { label: parts.join(" · "), tone: "mixed" };
}

/** Last five characters of a TCGplayer order number, which is enough to tell packages apart. */
export function orderTail(orderNumber: string): string {
  const n = orderNumber.trim();
  return n.length > 5 ? n.slice(-5) : n;
}

export function orderTitle(order: Pick<GroupBuyOrder, "seller_name" | "order_number">, index: number): string {
  const seller = order.seller_name.trim() || `Order ${index + 1}`;
  const tail = orderTail(order.order_number);
  return tail ? `${seller} · …${tail}` : seller;
}

export function orderMissing(order: Pick<GroupBuyOrder, "qty_allocated" | "qty_arrived">): number {
  return Math.max(0, order.qty_allocated - order.qty_arrived);
}

export function orderChip(order: Pick<GroupBuyOrder, "status" | "qty_allocated" | "qty_arrived">): { label: string; tone: ChipTone } {
  if (order.status === "arrived") return { label: "Arrived", tone: "done" };
  if (order.status === "partial") return { label: `Arrived · ${orderMissing(order)} missing`, tone: "mixed" };
  return { label: "On the way", tone: "way" };
}

/** Sellers whose unarrived orders still hold copies of this card for the member (or for anyone when no member is given). */
export function sellersOnTheWay(orders: GroupBuyOrder[], cardId: string, userId?: number): string[] {
  const names: string[] = [];
  orders.forEach((o, i) => {
    const waiting = o.lines.some(
      (l) =>
        l.card_id === cardId &&
        l.allocations.some((a) => (userId === undefined || a.user_id === userId) && a.qty > a.qty_arrived),
    );
    const name = o.seller_name.trim() || `Order ${i + 1}`;
    if (waiting && !names.includes(name)) names.push(name);
  });
  return names;
}

export function lineAllocated(line: Pick<GroupBuyOrderLine, "allocations">): number {
  return line.allocations.reduce((s, a) => s + a.qty, 0);
}

/** The arrived count per order line the Check items sheet starts from, never above what members were allocated. */
export function arrivalDraft(order: GroupBuyOrder): Record<number, number> {
  return Object.fromEntries(order.lines.map((l) => [l.id, Math.min(l.qty_arrived, lineAllocated(l))]));
}

export function allArrivedDraft(order: GroupBuyOrder): Record<number, number> {
  return Object.fromEntries(order.lines.map((l) => [l.id, lineAllocated(l)]));
}

export function draftTotal(draft: Record<number, number>): number {
  return Object.values(draft).reduce((s, n) => s + n, 0);
}

export function arrivalPayload(order: GroupBuyOrder, draft: Record<number, number>) {
  return {
    expected_version: order.version,
    lines: order.lines.map((l) => ({ line_id: l.id, qty_arrived: Math.max(0, Math.min(draft[l.id] ?? 0, lineAllocated(l))) })),
  };
}

/** Cards a hand-picked order can take: the ones with copies not in any order yet. */
export function pickableLines(lines: GroupBuyLine[]): GroupBuyLine[] {
  return lines.filter((l) => (l.not_ordered ?? 0) > 0);
}

export function pickedOrderLines(lines: GroupBuyLine[], qtyByCard: Record<string, number>) {
  return pickableLines(lines)
    .map((l) => ({ card_id: l.card_id, qty: Math.min(qtyByCard[l.card_id] ?? 0, l.not_ordered ?? 0) }))
    .filter((l) => l.qty > 0);
}

/** The art an order line shows: the alt it was bought as, else the card's usual art. */
export function orderLineArt(line: GroupBuyLine | undefined, productId: number | null): string | undefined {
  if (!line) return undefined;
  const alt = productId ? line.alt_arts.find((a) => a.product_id === productId) : undefined;
  return alt?.image_url || lineArtUrl(line);
}

export function artLabel(line: GroupBuyLine | undefined, productId: number | null): string {
  const alt = productId ? line?.alt_arts.find((a) => a.product_id === productId) : undefined;
  return alt ? alt.name || "Alt art" : "Base";
}

export function notOrderedCopies(detail: Pick<GroupBuyDetail, "lines">): number {
  return detail.lines.reduce((s, l) => s + (l.not_ordered ?? 0), 0);
}
