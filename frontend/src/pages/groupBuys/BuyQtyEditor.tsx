import { useEffect, useState } from "react";
import { money, type GroupBuyMyExtra } from "../../api";

export function BuyQtyEditor({
  cardId,
  qty,
  suggestedQty,
  isCustom,
  excluded,
  disabled,
  onSave,
  onReset,
  onExclude,
  deckQty = 0,
  extras = [],
  onExtraSkip,
}: {
  cardId: string;
  qty: number;
  suggestedQty: number;
  isCustom: boolean;
  excluded: boolean;
  disabled: boolean;
  onSave: (qty: number) => void;
  onReset: () => void;
  onExclude: () => void;
  /** Copies bought for the viewer's decks; shown above the Extra copies (#1269). */
  deckQty?: number;
  /** The viewer's Extra copies on this card; each can be left out of this group buy (#1269). */
  extras?: GroupBuyMyExtra[];
  onExtraSkip?: (productId: number, skip: number) => void;
}) {
  const [draft, setDraft] = useState(String(qty));

  useEffect(() => {
    setDraft(String(qty));
  }, [qty, cardId]);

  function commit() {
    const n = Math.max(0, Math.min(999, Math.floor(Number(draft))));
    if (!Number.isFinite(n)) {
      setDraft(String(qty));
      return;
    }
    setDraft(String(n));
    if (n !== qty) onSave(n);
  }

  const showExtras = !excluded && extras.length > 0 && Boolean(onExtraSkip);

  return (
    <div className={`group-buy-qty${excluded ? " excluded" : ""}`}>
      <div className="group-buy-qty-controls">
        <button
          type="button"
          className="owned-btn"
          aria-label={`Decrease buy qty for ${cardId}`}
          disabled={disabled || qty <= 0}
          onClick={() => onSave(Math.max(0, qty - 1))}
        >
          −
        </button>
        <input
          className="group-buy-qty-input"
          inputMode="numeric"
          aria-label={`Buy quantity for ${cardId}`}
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
        />
        <button
          type="button"
          className="owned-btn"
          aria-label={`Increase buy qty for ${cardId}`}
          disabled={disabled || qty >= 999}
          onClick={() => onSave(Math.min(999, qty + 1))}
        >
          +
        </button>
      </div>
      {showExtras ? (
        <div className="group-buy-qty-meta group-buy-extras">
          <span className="group-buy-extras-deck" data-testid="gb-deck-qty">
            {deckQty} for your decks
          </span>
          {extras.map((e) => (
            <ExtraRow
              key={e.product_id}
              extra={e}
              disabled={disabled}
              onSkip={(skip) => onExtraSkip?.(e.product_id, skip)}
            />
          ))}
          {isCustom ? (
            <span className="muted">
              Shopping suggests {suggestedQty}
              <button type="button" className="ghost" disabled={disabled} onClick={onReset}>
                Use suggested
              </button>
            </span>
          ) : null}
        </div>
      ) : (
        <div className="group-buy-qty-meta muted">
          {excluded ? (
            <span>Excluded from group buy</span>
          ) : isCustom ? (
            <>
              <span>Shopping suggests {suggestedQty}</span>
              <button type="button" className="ghost" disabled={disabled} onClick={onReset}>
                Use suggested
              </button>
            </>
          ) : (
            <span>From shopping</span>
          )}
        </div>
      )}
      {excluded ? (
        <button
          type="button"
          className="btn secondary group-buy-exclude-btn"
          disabled={disabled}
          onClick={onReset}
        >
          Include again
        </button>
      ) : (
        <button
          type="button"
          className="btn secondary group-buy-exclude-btn"
          disabled={disabled}
          onClick={onExclude}
        >
          Exclude from group buy
        </button>
      )}
    </div>
  );
}

/** One Extra copy line: tick to include it in this buy, or a 0..wanted stepper when several are wanted. */
function ExtraRow({
  extra,
  disabled,
  onSkip,
}: {
  extra: GroupBuyMyExtra;
  disabled: boolean;
  onSkip: (skip: number) => void;
}) {
  const included = Math.max(0, extra.wanted - extra.skipped);
  const price = extra.market_price != null ? money(extra.market_price) : "n/a";
  const fullySkipped = included === 0;
  return (
    <>
      {extra.wanted >= 2 ? (
        <div className="group-buy-extra-row" data-testid="gb-extra-row">
          <span className="group-buy-extra-stepper">
            <button
              type="button"
              className="owned-btn"
              aria-label={`Fewer Extra copies of ${extra.name}`}
              disabled={disabled || included <= 0}
              onClick={() => onSkip(extra.skipped + 1)}
            >
              −
            </button>
            <span className="group-buy-extra-count" aria-live="polite">
              {included}
            </span>
            <button
              type="button"
              className="owned-btn"
              aria-label={`More Extra copies of ${extra.name}`}
              disabled={disabled || included >= extra.wanted}
              onClick={() => onSkip(extra.skipped - 1)}
            >
              +
            </button>
          </span>
          <span className="group-buy-extra-text">
            <span className="group-buy-extra-title">Extra copies</span>
            <span className="group-buy-extra-sub">
              {extra.name} · <span className="group-buy-extra-price">{price}</span> each
            </span>
          </span>
        </div>
      ) : (
        <label className="group-buy-extra-row" data-testid="gb-extra-row">
          <input
            type="checkbox"
            checked={!fullySkipped}
            disabled={disabled}
            onChange={(e) => onSkip(e.target.checked ? 0 : extra.wanted)}
          />
          <span className="group-buy-extra-text">
            <span className="group-buy-extra-title">+1 Extra copy</span>
            <span className="group-buy-extra-sub">
              {extra.name} · <span className="group-buy-extra-price">{price}</span>
            </span>
          </span>
        </label>
      )}
      {fullySkipped ? (
        <span className="group-buy-extra-skipped muted" data-testid="gb-extra-skipped">
          Skipped in this buy · still on your Shopping list
        </span>
      ) : null}
    </>
  );
}
