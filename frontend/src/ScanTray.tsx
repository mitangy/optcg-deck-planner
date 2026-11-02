/** Review tray for a multi-card photo scan: confirm, fix or skip each card before adding. */

import { useState } from "react";
import type { CatalogCardResult, ShoppingItem } from "./api";
import { CardArtImg } from "./CardThumb";
import { MarketPrice } from "./MarketPrice";
import { ScanShare } from "./ScanShare";
import { MAX_ROW_QTY, trayNeedText, trayReadyCount, type TrayRow } from "./scanTray";

export type ScanTarget = "collection" | "shopping";

const CHIP: Record<string, string> = {
  sure: "Sure",
  check: "Check",
  none: "No match",
  fixed: "Fixed",
};

function TrayRowView({
  row,
  card,
  needItem,
  showNeed,
  onQty,
  onFix,
}: {
  row: TrayRow;
  card: CatalogCardResult | undefined;
  /** The shopping-list entry for this card, if it is on the list. */
  needItem: ShoppingItem | undefined;
  showNeed: boolean;
  onQty: (qty: number) => void;
  /** Resolves to an error message, or null when the number was accepted. */
  onFix: (cardId: string) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kind = row.fixed ? "fixed" : row.confidence;
  const canFix = !row.fixed && row.confidence !== "sure";
  const showForm = canFix && (row.confidence === "none" || open);
  const name = card?.name ?? row.cardId ?? "Unknown card";

  const submit = async () => {
    const id = text.trim();
    if (!id || busy) return;
    setBusy(true);
    const err = await onFix(id);
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <li
      className={`scan-tray-row ${kind}${row.qty === 0 ? " skipped" : ""}`}
      data-card-id={row.cardId ?? undefined}
    >
      <div className="scan-tray-media">
        <span className="scan-tray-art crop">
          <img src={row.thumbs[0]} alt="Detected card" />
          {row.thumbs.length > 1 && <b className="scan-tray-multi">×{row.thumbs.length}</b>}
        </span>
        <span className="scan-tray-art">
          {card ? <CardArtImg src={card.image_url} cardId={card.card_id} alt={card.name} /> : null}
        </span>
      </div>
      <div className="scan-tray-info">
        <p className="scan-tray-name">{row.cardId ? name : "Not recognised"}</p>
        <p className="scan-tray-meta">
          {row.cardId ?? "Type the card number"}
          {card && (
            <>
              {" "}
              · <MarketPrice price={card.market_price} />
            </>
          )}
        </p>
        {showNeed && row.cardId && (
          <p
            className={`scan-tray-need${needItem && needItem.still_need > 0 ? " wanted" : ""}`}
          >
            {trayNeedText(needItem)}
          </p>
        )}
        <div className="scan-tray-tags">
          <span className={`scan-chip ${kind}`}>{CHIP[kind]}</span>
          {canFix && row.confidence !== "none" && (
            <button
              type="button"
              className="ghost scan-tray-fix"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              Fix
            </button>
          )}
        </div>
      </div>
      <div className="scan-qty" role="group" aria-label={`Copies of ${name}`}>
        <button
          type="button"
          aria-label={`Fewer ${name}`}
          disabled={row.qty <= 0 || !row.cardId}
          onClick={() => onQty(row.qty - 1)}
        >
          −
        </button>
        <span className="scan-qty-n">{row.qty}</span>
        <button
          type="button"
          aria-label={`More ${name}`}
          disabled={row.qty >= MAX_ROW_QTY || !row.cardId}
          onClick={() => onQty(row.qty + 1)}
        >
          +
        </button>
      </div>
      {showForm && (
        <form
          className="scan-tray-fixform"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            placeholder="OP15-053"
            aria-label="Card number"
            autoComplete="off"
            autoCapitalize="characters"
          />
          <button type="submit" disabled={!text.trim() || busy}>
            Use
          </button>
          {error && <p className="scan-tray-fixerr">{error}</p>}
        </form>
      )}
    </li>
  );
}

export function ScanTray({
  rows,
  found,
  cards,
  items = [],
  showNeed = false,
  target = "collection",
  adding,
  addError,
  onQty,
  onFix,
  onAdd,
  onRescan,
}: {
  rows: TrayRow[];
  /** Cards detected in the photo (before merging). */
  found: number;
  cards: ReadonlyMap<string, CatalogCardResult>;
  /** Shopping list, used for the need line when `showNeed` is on. */
  items?: ShoppingItem[];
  showNeed?: boolean;
  target?: ScanTarget;
  adding: boolean;
  addError: string | null;
  onQty: (key: string, qty: number) => void;
  onFix: (key: string, cardId: string) => Promise<string | null>;
  onAdd: () => void;
  onRescan: () => void;
}) {
  const ready = trayReadyCount(rows);
  return (
    <div className="scan-tray">
      <p className="scan-tray-summary" role="status">
        {found} {found === 1 ? "card" : "cards"} found · {ready} ready
      </p>
      <ul className="scan-tray-list" aria-label="Detected cards">
        {rows.map((row) => (
          <TrayRowView
            key={row.key}
            row={row}
            card={row.cardId ? cards.get(row.cardId) : undefined}
            needItem={row.cardId ? items.find((i) => i.card_id.toUpperCase() === row.cardId) : undefined}
            showNeed={showNeed}
            onQty={(q) => onQty(row.key, q)}
            onFix={(id) => onFix(row.key, id)}
          />
        ))}
      </ul>
      <ScanShare />
      <div className="scan-tray-foot">
        <p className="scan-tray-error" role="alert">
          {addError}
        </p>
        <div className="scan-tray-foot-actions">
          <button type="button" className="ghost" onClick={onRescan} disabled={adding}>
            Rescan
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={onAdd}
            disabled={adding || ready === 0}
          >
            {adding
              ? target === "shopping"
                ? "Marking…"
                : "Adding…"
              : target === "shopping"
                ? `Mark ${ready} as owned`
                : `Add ${ready} ${ready === 1 ? "card" : "cards"} to collection`}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ScanAdded({
  count,
  target = "collection",
  onMore,
  onClose,
}: {
  count: number;
  target?: ScanTarget;
  onMore: () => void;
  onClose: () => void;
}) {
  return (
    <div className="scan-added">
      <p className="scan-added-title" role="status">
        {target === "shopping"
          ? `Marked ${count} as owned`
          : `Added ${count} ${count === 1 ? "card" : "cards"}`}
      </p>
      <p className="muted">
        {target === "shopping" ? "Your shopping list is updated." : "They are in your collection now."}
      </p>
      <div className="scan-tray-foot-actions">
        <button type="button" className="ghost" onClick={onClose}>
          Done
        </button>
        <button type="button" className="btn primary" onClick={onMore}>
          Scan more
        </button>
      </div>
    </div>
  );
}
