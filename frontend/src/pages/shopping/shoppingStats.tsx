import { CollectorLine, money } from "../../api";
import { collectorStatNote, collectorStillTotal, itemNeedsCopies } from "../../collectorLines";

type ShoppingStatsData = {
  unique_cards?: number;
  cards_still_needed?: number;
  remaining_market?: number;
  items: { still_need: number; collector_wants?: CollectorLine[] | null }[];
};

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
      </li>
    </ul>
  );
}
