import type { CollectorLine, PrintingView, ShoppingItem, ShoppingResponse } from "../../api";

export const COLLECTOR_MAX = 9;

type ItemWithLines = Pick<ShoppingItem, "still_need"> & { collector_wants?: CollectorLine[] | null };

export function collectorHaveText(line: Pick<CollectorLine, "want" | "have">): string {
  return line.have >= line.want ? "✓ Have it" : `Have ${line.have} of ${line.want}`;
}

export function collectorOnTopOf(usedIn: string[]): string {
  return usedIn.length > 0 ? `On top of ${usedIn.join(", ")}` : "";
}

export function itemNeedsCopies(item: ItemWithLines): boolean {
  return item.still_need > 0 || (item.collector_wants ?? []).some((l) => l.still_need > 0);
}

export function visibleCollectorLines(item: ItemWithLines, onlyNeed: boolean): CollectorLine[] {
  const lines = item.collector_wants ?? [];
  return onlyNeed ? lines.filter((l) => l.still_need > 0) : lines;
}

export function collectorStillTotal(items: { collector_wants?: CollectorLine[] | null }[]): number {
  return items.reduce((n, i) => n + (i.collector_wants ?? []).reduce((m, l) => m + l.still_need, 0), 0);
}

export function collectorCostTotal(items: { collector_wants?: CollectorLine[] | null }[]): number {
  return items.reduce((n, i) => n + (i.collector_wants ?? []).reduce((m, l) => m + (l.remaining_cost ?? 0), 0), 0);
}

/**
 * What is left to spend on one card's main row on Master Shopping: the decks' part only (#1187). Extra copies
 * (collector lines) show their own price on their own rows, so adding them here would count the same dollars twice.
 * Null only when the deck part is unpriced while copies are still needed.
 */
export function shoppingLeftCost(
  item: Pick<ShoppingItem, "still_need" | "remaining_cost"> & { collector_wants?: CollectorLine[] | null },
): number | null {
  if (item.remaining_cost == null && item.still_need > 0) return null;
  return item.remaining_cost ?? 0;
}

type ExtraCostItem = Pick<ShoppingItem, "still_need" | "remaining_cost"> & {
  collector_wants?: Pick<CollectorLine, "still_need" | "remaining_cost">[] | null;
};

export function hasExtraCopiesToBuy(item: Pick<ExtraCostItem, "collector_wants">): boolean {
  return (item.collector_wants ?? []).some((l) => l.still_need > 0);
}

export function shoppingSortCost(item: ExtraCostItem): number | null {
  const deck = shoppingLeftCost({ still_need: item.still_need, remaining_cost: item.remaining_cost });
  if (deck == null) return null;
  const extra = (item.collector_wants ?? []).reduce((n, l) => n + (l.remaining_cost ?? 0), 0);
  return Math.round((deck + extra) * 100) / 100;
}

export function shoppingRowAmount(item: ExtraCostItem): number | null {
  if (item.still_need === 0 && hasExtraCopiesToBuy(item)) {
    const extra = (item.collector_wants ?? []).reduce((n, l) => n + (l.still_need > 0 ? (l.remaining_cost ?? 0) : 0), 0);
    return Math.round(extra * 100) / 100;
  }
  return shoppingLeftCost({ still_need: item.still_need, remaining_cost: item.remaining_cost });
}

export function deckOwnedOfAlt(alt: Pick<PrintingView, "owned" | "collector">): number {
  const owned = alt.owned ?? 0;
  return Math.max(0, owned - Math.min(owned, alt.collector ?? 0));
}

export function collectorReserved(alts: Pick<PrintingView, "owned" | "collector">[] | null | undefined): number {
  return (alts ?? []).reduce((n, a) => n + Math.min(a.owned ?? 0, a.collector ?? 0), 0);
}

export function deckAltsOwned(altsOwned: number | undefined, alts: Pick<PrintingView, "owned" | "collector">[] | null | undefined): number {
  return Math.max(0, (altsOwned ?? 0) - collectorReserved(alts));
}

export function canOpenBuyPopover(
  card: { still_need: number; alt_arts?: unknown[] | null },
  collectorPickable: boolean,
): boolean {
  const hasAlts = (card.alt_arts?.length ?? 0) > 0;
  return hasAlts && (card.still_need > 0 || collectorPickable);
}

export function collectorChoices<A extends { is_special?: boolean }>(alts: A[] | null | undefined): A[] {
  return (alts ?? []).filter((a) => a.is_special !== false);
}

function lineFor(alt: PrintingView, qty: number, prev?: CollectorLine): CollectorLine {
  const have = Math.min(alt.owned ?? 0, qty);
  const still = qty - have;
  return {
    product_id: alt.product_id,
    label: prev?.label ?? alt.name,
    image_url: prev?.image_url ?? alt.image_url ?? null,
    market_price: alt.market_price,
    want: qty,
    have,
    still_need: still,
    remaining_cost: still === 0 ? 0 : alt.market_price == null ? null : Math.round(still * alt.market_price * 100) / 100,
  };
}

export function refreshCollectorHave(
  lines: CollectorLine[] | undefined,
  productId: number,
  owned: number,
): CollectorLine[] | undefined {
  if (!lines) return lines;
  return lines.map((l) => {
    if (l.product_id !== productId) return l;
    const have = Math.min(owned, l.want);
    const still = l.want - have;
    const remaining = still === 0 ? 0 : l.market_price == null ? null : Math.round(still * l.market_price * 100) / 100;
    return { ...l, have, still_need: still, remaining_cost: remaining };
  });
}

export function applyCollectorToShopping(
  old: ShoppingResponse,
  cardId: string,
  productId: number,
  qty: number,
): ShoppingResponse {
  const id = cardId.toUpperCase();
  let stillDelta = 0;
  let costDelta = 0;
  const items = old.items.map((item) => {
    if (item.card_id.toUpperCase() !== id) return item;
    const alt = (item.alt_arts ?? []).find((a) => a.product_id === productId);
    if (!alt) return item;
    const before = collectorStillTotal([item]);
    const costBefore = collectorCostTotal([item]);
    const prev = (item.collector_wants ?? []).find((l) => l.product_id === productId);
    let lines = (item.collector_wants ?? []).filter((l) => l.product_id !== productId);
    if (qty > 0) {
      const line = lineFor(alt, qty, prev);
      lines = prev
        ? (item.collector_wants ?? []).map((l) => (l.product_id === productId ? line : l))
        : [...lines, line];
    }
    const patched: ShoppingItem = {
      ...item,
      collector_wants: lines,
      alt_arts: item.alt_arts.map((a) => (a.product_id === productId ? { ...a, collector: qty } : a)),
    };
    stillDelta += collectorStillTotal([patched]) - before;
    costDelta += collectorCostTotal([patched]) - costBefore;
    return patched;
  });
  return {
    ...old,
    items,
    cards_still_needed: old.cards_still_needed + stillDelta,
    remaining_market: Math.round((old.remaining_market + costDelta) * 100) / 100,
    collector_copies: items.reduce((n, i) => n + (i.collector_wants ?? []).reduce((m, l) => m + l.want, 0), 0),
  };
}

export function collectorStatNote(copies: number | undefined): string | null {
  return copies && copies > 0 ? `incl. ${copies} collector` : null;
}

export function collectorSelectKey(cardId: string, productId: number): string {
  return `collector:${cardId}:${productId}`;
}
