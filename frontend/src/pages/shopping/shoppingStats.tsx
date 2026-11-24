import { formatMoneyCompact } from "@optcg/card-core";
import { CollectorLine, money } from "../../api";
import { collectorCostTotal, collectorStatNote, collectorStillTotal, itemNeedsCopies } from "../collection/collectorLines";

type ShoppingStatsData = {
  unique_cards?: number;
  cards_still_needed?: number;
  remaining_market?: number;
  items: {
    still_need: number;
    remaining_cost?: number | null;
    deck_need?: number;
    collector_wants?: CollectorLine[] | null;
  }[];
};

const cents = (n: number) => Math.round(n * 100) / 100;

export function shoppingCostSplit(data: ShoppingStatsData | null | undefined) {
  const items = data?.items ?? [];
  const extra = cents(collectorCostTotal(items));
  const added = cents(items.reduce((n, i) => ((i.deck_need ?? 0) === 0 ? n + (i.remaining_cost ?? 0) : n), 0));
  const decks = cents(Math.max(0, (data?.remaining_market ?? 0) - added - extra));
  return { decks, added, extra };
}

function compactMoney(n: number): string {
  return formatMoneyCompact(n);
}

export function shoppingCostParts(data: ShoppingStatsData | null | undefined): string[] {
  const { decks, added, extra } = shoppingCostSplit(data);
  const parts = [
    ["Decks", decks],
    ["Added", added],
    ["Extra", extra],
  ] as const;
  const shown = parts.filter(([, n]) => n > 0);
  return shown.length < 2 ? [] : shown.map(([label, n]) => `${label} ${compactMoney(n)}`);
}

function shoppingListStats(data: ShoppingStatsData | null | undefined) {
  const items = data?.items ?? [];
  return {
    totalUnique: data?.unique_cards ?? items.length,
    uniqueStillNeeded: items.filter(itemNeedsCopies).length,
    totalStillNeeded: data?.cards_still_needed ?? 0,
    remainingMarket: data?.remaining_market,
    collectorStill: collectorStillTotal(items),
  };
}

export function formatShoppingListStats(data: ShoppingStatsData | null | undefined) {
  const { totalUnique, uniqueStillNeeded, totalStillNeeded, remainingMarket } = shoppingListStats(data);
  return (
    `${uniqueStillNeeded}/${totalUnique} cards to buy · ${totalStillNeeded} copies · ` +
    `${money(remainingMarket)}`
  );
}

export function ShoppingStatStrip({ data }: { data: ShoppingStatsData | null | undefined }) {
  const { totalUnique, uniqueStillNeeded, totalStillNeeded, remainingMarket, collectorStill } = shoppingListStats(data);
  const collectorNote = collectorStatNote(collectorStill);
  const costParts = shoppingCostParts(data);
  return (
    <ul className="stat-strip" aria-label="Shopping totals">
      <li>
        <span className="stat-label" title="Cards that still need copies, out of every card on the list">Cards to buy</span>
        <span className="stat-value">
          {uniqueStillNeeded}
          <small> / {totalUnique}</small>
        </span>
      </li>
      <li>
        <span className="stat-label" title="Copies still to buy across those cards">Copies</span>
        <span className="stat-value">{totalStillNeeded}</span>
        {collectorNote ? <span className="stat-note">{collectorNote}</span> : null}
      </li>
      <li>
        <span className="stat-label">Est. cost</span>
        <span className="stat-value gold">{money(remainingMarket)}</span>
        {costParts.length > 0 ? (
          <span className="stat-note stat-split" title="Est. cost: your decks, cards you added, and Extra copies">
            {costParts.map((part, i) => (
              <span key={part}>
                {i > 0 ? " · " : ""}
                {part}
              </span>
            ))}
          </span>
        ) : null}
      </li>
    </ul>
  );
}
