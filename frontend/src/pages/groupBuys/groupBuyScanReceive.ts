import type { GroupBuyLine, GroupBuyOrder } from "../../api";
import { lineAllocated, orderTitle } from "./groupBuyOrders";

/** One card the scanner recognised. productId is the printing when the scanner knows it. */
export type ScannedCard = { cardId: string; productId?: number | null };

export type NotInOrderEntry = {
  cardId: string;
  name: string;
  count: number;
  /** Other orders of this group buy that hold the card, as "<seller> order" labels. */
  elsewhere: string[];
};

export type ScanReceiveState = {
  draft: Record<number, number>;
  notInOrder: NotInOrderEntry[];
};

export type ScanReceiveResult = ScanReceiveState & {
  /** Line ids whose count went up in this scan, for the flash. */
  bumped: number[];
  counted: number;
};

type OrderLine = GroupBuyOrder["lines"][number];

/** Art match first, then the standard line. A scan that names an art never lands on a different alt; one that names none may fill an alt line. */
function candidateLines(lines: OrderLine[], cardId: string, productId: number | null | undefined): OrderLine[] {
  const same = lines.filter((l) => l.card_id === cardId);
  const exact = productId == null ? [] : same.filter((l) => l.product_id === productId);
  if (exact.length > 0) return exact;
  const standard = same.filter((l) => l.product_id == null);
  const alts = productId == null ? same.filter((l) => l.product_id != null) : [];
  return [...standard, ...alts];
}

export function otherOrdersWith(cardId: string, order: GroupBuyOrder, orders: GroupBuyOrder[]): string[] {
  const out: string[] = [];
  orders.forEach((o, i) => {
    if (o.id === order.id || !o.lines.some((l) => l.card_id === cardId)) return;
    const label = `${orderTitle({ seller_name: o.seller_name, order_number: "" }, i)} order`;
    if (!out.includes(label)) out.push(label);
  });
  return out;
}

/** Counts scanned cards into the Check items draft. Nothing here saves: the host reviews the draft and presses Save. */
export function applyScans(
  order: GroupBuyOrder,
  orders: GroupBuyOrder[],
  lines: GroupBuyLine[],
  state: ScanReceiveState,
  scans: ScannedCard[],
): ScanReceiveResult {
  const draft = { ...state.draft };
  const notInOrder = state.notInOrder.map((e) => ({ ...e }));
  const bumped = new Set<number>();
  let counted = 0;
  const nameOf = (cardId: string) =>
    lines.find((l) => l.card_id === cardId)?.name || order.lines.find((l) => l.card_id === cardId)?.name || cardId;

  for (const scan of scans) {
    const cardId = scan.cardId.trim().toUpperCase();
    const target = candidateLines(order.lines, cardId, scan.productId).find((l) => (draft[l.id] ?? 0) < lineAllocated(l));
    if (target) {
      draft[target.id] = (draft[target.id] ?? 0) + 1;
      bumped.add(target.id);
      counted += 1;
      continue;
    }
    const seen = notInOrder.find((e) => e.cardId === cardId);
    if (seen) seen.count += 1;
    else notInOrder.push({ cardId, name: nameOf(cardId), count: 1, elsewhere: otherOrdersWith(cardId, order, orders) });
  }
  return { draft, notInOrder, bumped: [...bumped], counted };
}

/** The one line the scanner shows after a scan. */
export function scanSummary(counted: number, notInOrder: number, unread: number): string {
  const parts = [`${counted} counted`];
  if (notInOrder > 0) parts.push(`${notInOrder} not in this order`);
  if (unread > 0) parts.push(`${unread} not recognised`);
  return parts.join(" · ");
}
