import type { GroupBuyHistoryOrder, GroupBuyLine } from "../../api";
import { addableHistoryOrders, historyHeading } from "./groupBuyOrders";
import { PreviewBody, PreviewSummary } from "./OrderPreview";

/** Every order found on a pasted or uploaded Order History page, each with a checkbox. */
export function HistoryOrders({
  orders,
  selected,
  lines,
  narrow,
  onChange,
}: {
  orders: GroupBuyHistoryOrder[];
  selected: ReadonlySet<string>;
  lines: GroupBuyLine[];
  narrow: boolean;
  onChange: (next: Set<string>) => void;
}) {
  const addable = addableHistoryOrders(orders);
  const allOn = addable.length > 0 && addable.every((o) => selected.has(o.order_number));
  const toggle = (number: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(number);
    else next.delete(number);
    onChange(next);
  };
  return (
    <div className="gb-history" data-testid="gb-history-preview">
      <div className="gb-history-bar">
        <h3 className="gb-preview-title" aria-live="polite">
          {historyHeading(orders.length, addable.filter((o) => selected.has(o.order_number)).length)}
        </h3>
        {addable.length > 1 ? (
          <button type="button" className="gb-link-btn" onClick={() => onChange(new Set(allOn ? [] : addable.map((o) => o.order_number)))}>
            {allOn ? "Select none" : "Select all"}
          </button>
        ) : null}
      </div>
      <ul className="gb-history-list">
        {orders.map((o) => {
          const checked = !o.already_added && selected.has(o.order_number);
          return (
            <li key={o.order_number} className={`gb-history-order${o.already_added ? " is-added" : ""}`} data-testid="gb-history-order">
              <label className="gb-history-head">
                <input
                  type="checkbox"
                  className="gb-picker-check"
                  checked={checked}
                  disabled={o.already_added}
                  onChange={(e) => toggle(o.order_number, e.target.checked)}
                  aria-label={`Add order ${o.order_number}`}
                />
                <span className="gb-history-id">{o.order_number}</span>
                {o.already_added ? <span className="gb-chip gb-chip-done">Already added</span> : null}
              </label>
              <p className="muted gb-history-meta">
                {[o.seller_name, o.order_date].filter(Boolean).join(" · ") || "Seller not found"}
                {o.tracking_number ? (
                  <>
                    {" · "}
                    {o.tracking_url ? (
                      <a href={o.tracking_url} target="_blank" rel="noreferrer noopener">
                        Track {o.tracking_number}
                      </a>
                    ) : (
                      <span>Tracking {o.tracking_number}</span>
                    )}
                  </>
                ) : null}
              </p>
              {o.already_added ? null : (
                <>
                  {o.in_group_buy ? null : <p className="gb-history-note">No cards from this group buy</p>}
                  <PreviewSummary preview={o} />
                  <PreviewBody preview={o} lines={lines} narrow={narrow} />
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
