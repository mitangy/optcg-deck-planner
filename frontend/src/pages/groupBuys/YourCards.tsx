import { useState } from "react";
import type { GroupBuyDetail } from "../../api";
import { CardThumb } from "../../ui/CardThumb";
import { cardStatus, packageCounts, sellersOnTheWay } from "./groupBuyOrders";
import { ProgressBar, StatusChip } from "./PackagesSection";
import { lineArtUrl } from "./useGroupBuyLines";

const FOLDED_ROWS = 6;

/** The viewer's own cards and where each one is, from the my_* counts. */
export function YourCards({ detail, userId }: { detail: GroupBuyDetail; userId: number | undefined }) {
  const [all, setAll] = useState(false);
  const orders = detail.orders ?? [];
  const mine = detail.lines.filter((l) => (l.my_in_order ?? 0) + (l.my_not_ordered ?? 0) > 0);
  if (mine.length === 0) return null;
  const counts = packageCounts(mine, true);
  const shown = all ? mine : mine.slice(0, FOLDED_ROWS);
  return (
    <section className="gb-yourcards" aria-label="Your cards" data-testid="gb-your-cards">
      <ProgressBar counts={counts} label="Your cards" />
      <ul className="gb-yourcards-list">
        {shown.map((l) => {
          const chip = cardStatus(
            packageCounts([l], true),
            sellersOnTheWay(orders, l.card_id, userId),
          );
          return (
            <li key={l.card_id} className="gb-yourcards-row">
              <CardThumb src={lineArtUrl(l)} cardId={l.card_id} alt={l.name} />
              <span className="gb-yourcards-name">
                <strong>{l.name}</strong>
                <span className="muted">
                  {l.card_id} · ×{(l.my_in_order ?? 0) + (l.my_not_ordered ?? 0)}
                </span>
              </span>
              {chip ? <StatusChip {...chip} /> : null}
            </li>
          );
        })}
      </ul>
      {mine.length > FOLDED_ROWS ? (
        <button type="button" className="gb-link-btn" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? "Show fewer" : `Show all ${mine.length} cards`}
        </button>
      ) : null}
    </section>
  );
}
