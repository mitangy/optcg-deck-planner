import { useEffect, useState } from "react";

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
