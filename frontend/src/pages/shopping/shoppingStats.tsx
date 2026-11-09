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

/**
 * Where the Est. cost goes (#1182), from the items so optimistic edits stay in sync: Extra copies (collector
 * wants), cards added directly to Master Shopping (in no included deck), and the rest, which is the decks.
 */
export function shoppingCostSplit(data: ShoppingStatsData | null | undefined) {
  const items = data?.items ?? [];
  const extra = cents(collectorCostTotal(items));
  const added = cents(items.reduce((n, i) => ((i.deck_need ?? 0) === 0 ? n + (i.remaining_cost ?? 0) : n), 0));
  const decks = cents(Math.max(0, (data?.remaining_market ?? 0) - added - extra));
  return { decks, added, extra };
}

/** "$850" or "$2.0k": short enough for three parts to fit under the total on a phone. */
function compactMoney(n: number): string {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
}

/** The parts of the Est. cost worth naming; empty when one part (or none) is the whole total. */
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
  // Keep to one scannable line on mobile — avoid burying the card list below chrome.
  return (
    `${uniqueStillNeeded}/${totalUnique} uniques left · ${totalStillNeeded} copies · ` +
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
        <span className="stat-label">Cards left</span>
        <span className="stat-value">
          {uniqueStillNeeded}
          <small> / {totalUnique}</small>
        </span>
      </li>
      <li>
        <span className="stat-label">Copies</span>
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
