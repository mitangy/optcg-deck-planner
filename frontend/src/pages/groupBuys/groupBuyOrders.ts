import type { GroupBuyDetail, GroupBuyHistoryOrder, GroupBuyLine, GroupBuyOrder, GroupBuyOrderLine } from "../../api";
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

/** The three phrases under the progress bar, all in copies. Zero counts stay so the line keeps its shape. */
export function progressLabels(c: PackageCounts): string[] {
  return [`${c.arrived} of ${countsTotal(c)} copies arrived`, `${c.onTheWay} on the way`, `${c.notOrdered} not in an order yet`];
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

/** Copies of each card this order already holds for members, which editing the order frees up again. */
function ownAllocated(order: GroupBuyOrder | undefined, cardId: string): number {
  return (order?.lines ?? []).filter((l) => l.card_id === cardId).reduce((s, l) => s + lineAllocated(l), 0);
}

/** Cards a hand-picked order can take: the ones with copies not in any order yet (plus the edited order's own copies). */
export function pickableLines(lines: GroupBuyLine[], order?: GroupBuyOrder): GroupBuyLine[] {
  return lines
    .map((l) => ({ ...l, not_ordered: (l.not_ordered ?? 0) + ownAllocated(order, l.card_id) }))
    .filter((l) => l.not_ordered > 0);
}

export function pickedOrderLines(lines: GroupBuyLine[], qtyByCard: Record<string, number>, order?: GroupBuyOrder) {
  return pickableLines(lines, order)
    .map((l) => ({ card_id: l.card_id, qty: Math.min(qtyByCard[l.card_id] ?? 0, l.not_ordered ?? 0) }))
    .filter((l) => l.qty > 0);
}

/** The checklist's starting counts: everything still to order, or for an edited order what it holds now. */
export function startingPicks(lines: GroupBuyLine[], order?: GroupBuyOrder): Record<string, number> {
  return Object.fromEntries(
    pickableLines(lines, order).map((l) => {
      const held = (order?.lines ?? []).filter((o) => o.card_id === l.card_id).reduce((s, o) => s + o.qty_ordered, 0);
      return [l.card_id, order ? Math.min(held, l.not_ordered ?? 0) : (l.not_ordered ?? 0)];
    }),
  );
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

const HISTORY_ORDER_NUMBER_RE = /\b[0-9A-F]{8}-[0-9A-F]{6}-[0-9A-F]{5}\b/i;

/** A whole TCGplayer Order History page: an order number plus item markers. Same test as the server's. */
export function looksLikeOrderHistory(text: string): boolean {
  if (!HISTORY_ORDER_NUMBER_RE.test(text)) return false;
  return /rarity:/i.test(text) || /\bitems\b[\s\S]*\bdetails\b/i.test(text);
}

/** Orders that can be added: not on this group buy yet. */
export function addableHistoryOrders(orders: GroupBuyHistoryOrder[]): GroupBuyHistoryOrder[] {
  return orders.filter((o) => !o.already_added);
}

/** Orders with cards from this group buy start checked; the rest of the page is usually other purchases. */
export function startingHistorySelection(orders: GroupBuyHistoryOrder[]): string[] {
  return addableHistoryOrders(orders)
    .filter((o) => o.in_group_buy)
    .map((o) => o.order_number);
}

/**
 * After more pages are added to the list: orders already on screen keep their tick (or untick),
 * orders that are new get the starting rule.
 */
export function carryHistorySelection(
  before: GroupBuyHistoryOrder[],
  selected: ReadonlySet<string>,
  after: GroupBuyHistoryOrder[],
): Set<string> {
  const seen = new Set(before.map((o) => o.order_number));
  const next = new Set<string>();
  for (const o of addableHistoryOrders(after)) {
    if (seen.has(o.order_number) ? selected.has(o.order_number) : o.in_group_buy) next.add(o.order_number);
  }
  return next;
}

/** The picked numbers in page order, so the import adds them the way the page lists them. */
export function pickedHistoryNumbers(orders: GroupBuyHistoryOrder[], picked: ReadonlySet<string>): string[] {
  return addableHistoryOrders(orders)
    .filter((o) => picked.has(o.order_number))
    .map((o) => o.order_number);
}

export function historyHeading(total: number, selected: number): string {
  return `Found ${total} ${total === 1 ? "order" : "orders"}, ${selected} selected`;
}

export function addOrdersLabel(selected: number): string {
  return `Add ${selected} ${selected === 1 ? "order" : "orders"}`;
}

/** Copies the picked orders put into this group buy (matched lines only). */
export function historyCopies(orders: GroupBuyHistoryOrder[], picked: ReadonlySet<string>): number {
  return orders
    .filter((o) => !o.already_added && picked.has(o.order_number))
    .reduce((sum, o) => sum + o.lines.reduce((s, l) => s + l.qty, 0), 0);
}

/** Who a card's not-ordered copies are for: "Nami ×1 · Zoro ×1", alt arts named, standard copies marked Base once an alt is in the mix. */
export function notOrderedWho(line: Pick<GroupBuyLine, "alt_arts" | "not_ordered_members">): string[] {
  const members = line.not_ordered_members ?? [];
  const mixed = members.some((m) => m.product_id != null) && members.some((m) => m.product_id == null);
  return members
    .filter((m) => m.qty > 0)
    .map((m) => {
      const alt = m.product_id != null ? artLabel(line as GroupBuyLine, m.product_id) : mixed ? "Base" : "";
      return `${m.display_name} ×${m.qty}${alt ? ` (${alt})` : ""}`;
    });
}

/** The art to show for a card's not-ordered copies: the alt most of them are, else the card's usual art. */
export function notOrderedArt(line: GroupBuyLine): string | undefined {
  const byArt = new Map<number | null, number>();
  for (const m of line.not_ordered_members ?? []) byArt.set(m.product_id ?? null, (byArt.get(m.product_id ?? null) ?? 0) + m.qty);
  let best: number | null = null;
  let bestQty = byArt.get(null) ?? 0;
  for (const [pid, qty] of byArt) {
    if (pid != null && qty > bestQty) {
      best = pid;
      bestQty = qty;
    }
  }
  return orderLineArt(line, best);
}

// ---- Packages toolbar: status, sort, search and counts (#1441) ----

export type PackageStatus = "on_the_way" | "partial" | "arrived";
export type PackageFilter = "all" | PackageStatus;
export type PackageSort = "not_arrived" | "seller" | "copies" | "added";

/** Packages needed before the search, pills and sort show; with fewer they are noise. */
export const PACKAGE_TOOLBAR_MIN = 4;

export const PACKAGE_SORT_LABELS: Record<PackageSort, string> = {
  not_arrived: "Not arrived first",
  seller: "Seller A–Z",
  copies: "Most copies",
  added: "Order added",
};
export const PACKAGE_SORTS = Object.keys(PACKAGE_SORT_LABELS) as PackageSort[];

const PACKAGE_FILTER_LABELS: Record<PackageFilter, string> = {
  all: "All",
  on_the_way: "On the way",
  partial: "Missing cards",
  arrived: "Arrived",
};

/** Where a package is: on the way, marked arrived with cards short ("partial"), or fully arrived. */
export function packageStatus(order: Pick<GroupBuyOrder, "status">): PackageStatus {
  return order.status === "arrived" || order.status === "partial" ? order.status : "on_the_way";
}

const STATUS_RANK: Record<PackageStatus, number> = { partial: 0, on_the_way: 1, arrived: 2 };

/** Lower case, with spaces, dashes and the "#…" the card shows left out, so "9ee3c" finds "…-9EE3C". */
export function searchKey(text: string): string {
  return text.toLowerCase().replace(/[\s\-.#…_]+/g, "");
}

export type PackageHit = { any: boolean; lines: GroupBuyOrderLine[] };

/** Does a package match the search? Names and card numbers always, the seller, 3+ characters of the order number, and member names only when asked (the host). */
export function packageHit(order: GroupBuyOrder, query: string, withMembers: boolean): PackageHit {
  const q = searchKey(query);
  if (!q) return { any: true, lines: [] };
  const lines = order.lines.filter(
    (l) =>
      searchKey(l.name).includes(q) ||
      searchKey(l.card_id).includes(q) ||
      (withMembers && l.allocations.some((a) => searchKey(a.display_name).includes(q))),
  );
  const own = searchKey(order.seller_name).includes(q) || (q.length >= 3 && searchKey(order.order_number).includes(q));
  return { any: own || lines.length > 0, lines };
}

export type PackageItem = { order: GroupBuyOrder; index: number; hit: PackageHit };
export type PackageFilterCounts = Record<PackageFilter, number>;

export function packageItems(orders: GroupBuyOrder[], query: string, withMembers: boolean): PackageItem[] {
  return orders.map((order, index) => ({ order, index, hit: packageHit(order, query, withMembers) }));
}

/** Pill counts for the packages that match the search, whatever pill is on, so they always say what a tap would show. */
export function packageFilterCounts(matched: PackageItem[]): PackageFilterCounts {
  const c: PackageFilterCounts = { all: matched.length, on_the_way: 0, partial: 0, arrived: 0 };
  for (const i of matched) c[packageStatus(i.order)] += 1;
  return c;
}

export function sortPackages(items: PackageItem[], sort: PackageSort): PackageItem[] {
  const byIndex = (a: PackageItem, b: PackageItem) => a.index - b.index;
  const seller = (i: PackageItem) => i.order.seller_name.trim();
  const cmp: Record<PackageSort, (a: PackageItem, b: PackageItem) => number> = {
    not_arrived: (a, b) => STATUS_RANK[packageStatus(a.order)] - STATUS_RANK[packageStatus(b.order)] || byIndex(a, b),
    // Packages with no seller name go last.
    seller: (a, b) => (!seller(a) ? 1 : 0) - (!seller(b) ? 1 : 0) || seller(a).localeCompare(seller(b), undefined, { sensitivity: "base" }) || byIndex(a, b),
    copies: (a, b) => b.order.qty_ordered - a.order.qty_ordered || byIndex(a, b),
    added: byIndex,
  };
  return [...items].sort(cmp[sort]);
}

export type PackageView = { matched: PackageItem[]; counts: PackageFilterCounts; list: PackageItem[] };

/** Search first, then count for the pills, then apply the pill and the sort. */
export function packageView(
  orders: GroupBuyOrder[],
  { query, filter, sort, withMembers }: { query: string; filter: PackageFilter; sort: PackageSort; withMembers: boolean },
): PackageView {
  const matched = packageItems(orders, query, withMembers).filter((i) => i.hit.any);
  const counts = packageFilterCounts(matched);
  const shown = filter === "all" ? matched : matched.filter((i) => packageStatus(i.order) === filter);
  return { matched, counts, list: sortPackages(shown, sort) };
}

export type PackagePill = { value: PackageFilter; label: string; count: number };

/** The pills to show: All and the selected one always, others with copies. With no search the empty On the way / Arrived stay, so the row keeps its shape; Missing cards hides at 0. */
export function packagePills(counts: PackageFilterCounts, selected: PackageFilter, hasQuery: boolean): PackagePill[] {
  const order: PackageFilter[] = ["all", "on_the_way", "partial", "arrived"];
  return order
    .filter((k) => k === "all" || k === selected || counts[k] > 0 || (!hasQuery && k !== "partial"))
    .map((k) => ({ value: k, label: PACKAGE_FILTER_LABELS[k], count: counts[k] }));
}

/** A pill with nothing in it (and no search to explain why) is a dead end: fall back to All. `shown` is how many packages are on screen. */
export function emptyPillFallback(selected: PackageFilter, counts: PackageFilterCounts, hasQuery: boolean, shown: number): PackageFilter {
  return selected !== "all" && !hasQuery && counts[selected] === 0 && shown === 0 ? "all" : selected;
}

export function packageFilterWord(filter: PackageFilter): string {
  return PACKAGE_FILTER_LABELS[filter];
}

/**
 * Package ids as they are laid out: those already on screen keep their place (even if they no longer
 * match, e.g. just marked arrived), packages that are gone drop out, new matches go to the end.
 */
export function keepPlace(shown: number[], fresh: number[], existing: ReadonlySet<number>): number[] {
  const kept = shown.filter((id) => existing.has(id));
  const have = new Set(kept);
  return [...kept, ...fresh.filter((id) => !have.has(id))];
}

/** Cards a search finds that no seller order covers yet, with who they are for. */
export function notOrderedMatches(lines: GroupBuyLine[], query: string): { name: string; copies: number; who: string[] }[] {
  const q = searchKey(query);
  if (!q) return [];
  return lines
    .filter((l) => (l.not_ordered ?? 0) > 0 && (searchKey(l.name).includes(q) || searchKey(l.card_id).includes(q)))
    .map((l) => ({
      name: l.name,
      copies: l.not_ordered ?? 0,
      who: [...new Set((l.not_ordered_members ?? []).filter((m) => m.qty > 0).map((m) => m.display_name))],
    }));
}

/** How many thumbnails fit a row (each takes `slot` px). More cards than that show one fewer and a +N chip. */
export function thumbSplit(total: number, width: number, slot: number): { shown: number; more: number } {
  const fit = Math.max(1, Math.floor(width / slot));
  if (total <= fit) return { shown: total, more: 0 };
  const shown = Math.max(1, fit - 1);
  return { shown, more: total - shown };
}

/** Matching cards first, in their own order, then the rest. */
export function hitsFirst(lines: GroupBuyOrderLine[], hits: GroupBuyOrderLine[]): GroupBuyOrderLine[] {
  if (hits.length === 0) return lines;
  const on = new Set(hits.map((l) => l.id));
  return [...lines.filter((l) => on.has(l.id)), ...lines.filter((l) => !on.has(l.id))];
}

/** "Nov 20" for the day a package arrived, in the viewer's time zone. */
export function arrivedDay(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** The seller as the card header shows it: the trimmed name, or null (shown as "Seller not set"). */
export function sellerName(order: Pick<GroupBuyOrder, "seller_name">): string | null {
  return order.seller_name.trim() || null;
}
