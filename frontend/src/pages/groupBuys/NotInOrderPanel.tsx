import type { GroupBuyDetail } from "../../api";
import { notOrderedCopies } from "./groupBuyOrders";

/** Copies no seller order covers yet. The host can buy them elsewhere, or close the group buy and leave them on Shopping lists. */
export function NotInOrderPanel({
  detail,
  busy,
  onMassEntry,
  onClose,
}: {
  detail: GroupBuyDetail;
  busy: boolean;
  onMassEntry: () => void;
  onClose: () => void;
}) {
  const n = notOrderedCopies(detail);
  if (n <= 0) return null;
  const cards = detail.lines.filter((l) => (l.not_ordered ?? 0) > 0);
  return (
    <section className="gb-notordered" aria-label="Not in an order yet" data-testid="gb-not-ordered">
      <h2 className="gb-section-heading">
        Not in an order yet ({n} {n === 1 ? "copy" : "copies"})
      </h2>
      <p className="muted">
        {cards.length} {cards.length === 1 ? "card" : "cards"} no seller order covers yet. Seller cancelled or not bought? Buy them separately, or close the group buy.
      </p>
      {detail.is_host ? (
        <div className="gb-notordered-actions">
          <button type="button" className="btn secondary" onClick={onMassEntry}>
            Copy Mass Entry for these
          </button>
          <button type="button" className="btn secondary" disabled={busy} onClick={onClose}>
            Close group buy
          </button>
        </div>
      ) : null}
    </section>
  );
}
