/**
 * Collector copies (#1031): an alt art a player wants on top of what their decks need.
 * Pure helpers for the Master Shopping line under a card, the "Still need" filter, the
 * price popover's eligibility and the optimistic cache patch.
 */
import type { CollectorLine, PrintingView, ShoppingItem, ShoppingResponse } from "../../api";

export const COLLECTOR_MAX = 9;

type ItemWithLines = Pick<ShoppingItem, "still_need"> & { collector_wants?: CollectorLine[] | null };

/** "Have 0 of 1" while copies are missing, "✓ Have it" once the want is covered. */
export function collectorHaveText(line: Pick<CollectorLine, "want" | "have">): string {
  return line.have >= line.want ? "✓ Have it" : `Have ${line.have} of ${line.want}`;
}

/** "On top of Deck A, Deck B"; blank for a card that is in no deck. */
export function collectorOnTopOf(usedIn: string[]): string {
  return usedIn.length > 0 ? `On top of ${usedIn.join(", ")}` : "";
}

/** Whether a card shows under the "Still need" filter: it needs copies, or a collector line does. */
export function itemNeedsCopies(item: ItemWithLines): boolean {
  return item.still_need > 0 || (item.collector_wants ?? []).some((l) => l.still_need > 0);
}

/** The collector lines to draw under a card: all of them, or only those still missing copies under "Still need". */
export function visibleCollectorLines(item: ItemWithLines, onlyNeed: boolean): CollectorLine[] {
  const lines = item.collector_wants ?? [];
  return onlyNeed ? lines.filter((l) => l.still_need > 0) : lines;
}

/** Collector copies still to buy across a list of cards. */
export function collectorStillTotal(items: { collector_wants?: CollectorLine[] | null }[]): number {
  return items.reduce((n, i) => n + (i.collector_wants ?? []).reduce((m, l) => m + l.still_need, 0), 0);
}

/** Money still to spend on collector copies across a list of cards. */
export function collectorCostTotal(items: { collector_wants?: CollectorLine[] | null }[]): number {
  return items.reduce((n, i) => n + (i.collector_wants ?? []).reduce((m, l) => m + (l.remaining_cost ?? 0), 0), 0);
}

/**
 * What is left to spend on one card on Master Shopping (#1167): the decks' remaining cost plus the cost of its
 * collector copies still to buy. Null only when the deck part is unpriced while copies are still needed.
 */
export function shoppingLeftCost(
  item: Pick<ShoppingItem, "still_need" | "remaining_cost"> & { collector_wants?: CollectorLine[] | null },
): number | null {
  if (item.remaining_cost == null && item.still_need > 0) return null;
  return Math.round(((item.remaining_cost ?? 0) + collectorCostTotal([item])) * 100) / 100;
}

/** Copies of an alt art that count toward decks: owned minus the ones held back as collector copies. */
export function deckOwnedOfAlt(alt: Pick<PrintingView, "owned" | "collector">): number {
  const owned = alt.owned ?? 0;
  return Math.max(0, owned - Math.min(owned, alt.collector ?? 0));
}

/** Alt copies held back as collector copies: they never count toward a deck's needs. */
export function collectorReserved(alts: Pick<PrintingView, "owned" | "collector">[] | null | undefined): number {
  return (alts ?? []).reduce((n, a) => n + Math.min(a.owned ?? 0, a.collector ?? 0), 0);
}

/** Alt copies that count toward decks: all owned alt copies minus the collector-reserved ones. */
export function deckAltsOwned(altsOwned: number | undefined, alts: Pick<PrintingView, "owned" | "collector">[] | null | undefined): number {
  return Math.max(0, (altsOwned ?? 0) - collectorReserved(alts));
}

/** Whether the price opens the popover: copies to split, or a collector copy to add. */
export function canOpenBuyPopover(
  card: { still_need: number; alt_arts?: unknown[] | null },
  collectorPickable: boolean,
): boolean {
  const hasAlts = (card.alt_arts?.length ?? 0) > 0;
  return hasAlts && (card.still_need > 0 || collectorPickable);
}

/** Alt arts a collector copy can be picked from: the special printings (never the base art). */
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

/** The collector lines of a card after one alt's owned count changed. */
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

/**
 * Sets one collector want in a cached shopping list: the card's line (added, changed or removed),
 * the alt tile's `collector` mark, and the totals. The server numbers replace this on refetch.
 */
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

/** The "incl. N collector" note under the Copies stat; null when there are none. */
export function collectorStatNote(copies: number | undefined): string | null {
  return copies && copies > 0 ? `incl. ${copies} collector` : null;
}

/** Selection key of a collector line in Master Shopping's selected set (card ids are the other keys). */
export function collectorSelectKey(cardId: string, productId: number): string {
  return `collector:${cardId}:${productId}`;
}
