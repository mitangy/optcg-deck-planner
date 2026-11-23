import type { GroupBuyDetail } from "../../api";
import { CardThumb } from "../../ui/CardThumb";
import { notOrderedArt, notOrderedCopies, notOrderedWho } from "./groupBuyOrders";

export const NOT_IN_ORDER_ID = "gb-not-ordered";
export const NOT_IN_ORDER_HEADING_ID = "gb-not-ordered-heading";

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
    <section className="gb-notordered" id={NOT_IN_ORDER_ID} aria-labelledby={NOT_IN_ORDER_HEADING_ID} data-testid="gb-not-ordered">
      <h2 className="gb-section-heading" id={NOT_IN_ORDER_HEADING_ID} tabIndex={-1}>
        Not in an order yet ({n} {n === 1 ? "copy" : "copies"})
      </h2>
      <p className="muted">
        {cards.length} {cards.length === 1 ? "card" : "cards"} no seller order covers yet. Seller cancelled or not bought? Buy them separately, or close the group buy.
      </p>
      <ul className="gb-notordered-list" data-testid="gb-not-ordered-list">
        {cards.map((l) => {
          const who = notOrderedWho(l);
          return (
            <li key={l.card_id} className="gb-notordered-row">
              <CardThumb src={notOrderedArt(l)} cardId={l.card_id} alt={l.name} />
              <span className="gb-notordered-name">
                <strong>{l.name}</strong>
                <span className="muted">
                  {l.card_id} · ×{l.not_ordered}
                </span>
                {who.length > 0 ? <span className="gb-notordered-who">{who.join(" · ")}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
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

/** Scroll the panel into view and move focus to its heading, for the link in the progress line. */
export function goToNotInOrder(): void {
  const heading = document.getElementById(NOT_IN_ORDER_HEADING_ID);
  const panel = document.getElementById(NOT_IN_ORDER_ID);
  if (!heading || !panel) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  panel.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  heading.focus({ preventScroll: true });
}
