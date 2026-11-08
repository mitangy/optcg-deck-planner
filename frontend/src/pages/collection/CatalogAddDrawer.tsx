import type { ReactNode } from "react";
import { CatalogCardResult, money } from "../../api";
import {
  CardSearchInput,
  CollapsibleDrawer,
  COLOR_ORDER,
} from "../../ui/cardListControls";
import { Select } from "@optcg/ui/popups";
import { CardThumb } from "../../ui/CardThumb";
import { InlineSkeleton } from "../../ui/Skeleton";
import { CATALOG_TYPE_FILTERS, useCatalogSearch } from "../../hooks/useCatalogSearch";

export const CARD_TYPE_OPTIONS = CATALOG_TYPE_FILTERS.map((t) => ({ value: t as string, label: t || "All types" }));

export const COLOR_OPTIONS = [{ value: "", label: "All colors" }, ...COLOR_ORDER.map((c) => ({ value: c as string, label: c }))];

/** Row key for a catalog search result: a card's base row and each of its alt-art rows are distinct. */
export function catalogRowKey(card: CatalogCardResult): string {
  return `${card.card_id}:${card.alt_product_id ?? 0}`;
}

/** "Alt art" chip beside the card id on alt-art search rows. Inline, so it never shifts the row. */
export function AltArtChip({ card }: { card: CatalogCardResult }) {
  return card.alt_product_id ? <span className="alt-art-chip">Alt art</span> : null;
}

/**
 * Catalog search drawer shared by Collection and Master Shopping: the deck
 * editor's search box + color/type filters + result rows, with the per-row
 * action and an optional extra meta line supplied by the page.
 */
export function CatalogAddDrawer({
  className,
  summary,
  storageKey,
  defaultOpen,
  idleHint,
  onScan,
  renderMeta,
  renderAction,
}: {
  className?: string;
  summary: string;
  storageKey: string;
  defaultOpen: boolean;
  idleHint: string;
  onScan?: () => void;
  renderMeta?: (card: CatalogCardResult) => ReactNode;
  renderAction: (card: CatalogCardResult) => ReactNode;
}) {
  const { query, setQuery, color, setColor, cardType, setCardType, searchEnabled, searchQ } = useCatalogSearch({
    colorKey: `${storageKey}_color`,
    typeKey: `${storageKey}_card_type`,
  });

  return (
    <div className={`deck-editor ${className ?? ""}`.trim()}>
      <CollapsibleDrawer label="Add cards" summary={summary} storageKey={storageKey} defaultOpen={defaultOpen}>
        <div className="deck-editor-filters">
          <CardSearchInput value={query} onChange={setQuery} />
          <div className="deck-editor-filter-row">
            <label className="deck-editor-select">
              <span className="sr-only">Color</span>
              <Select
                value={color}
                onChange={setColor}
                aria-label="Filter catalog by color"
                options={COLOR_OPTIONS}
              />
            </label>
            <label className="deck-editor-select">
              <span className="sr-only">Card type</span>
              <Select
                value={cardType}
                onChange={setCardType}
                aria-label="Filter catalog by card type"
                options={CARD_TYPE_OPTIONS}
              />
            </label>
            {onScan && (
              <button type="button" className="ghost scan-open" onClick={onScan}>
                Scan
              </button>
            )}
          </div>
        </div>

        {!searchEnabled && <p className="muted deck-editor-status">{idleHint}</p>}
        {searchEnabled && searchQ.isLoading && <InlineSkeleton lines={3} label="Searching catalog…" />}
        {searchEnabled && searchQ.error && (
          <p className="error deck-editor-status">{(searchQ.error as Error).message}</p>
        )}
        {searchEnabled && searchQ.data && searchQ.data.length === 0 && (
          <p className="muted deck-editor-status">No catalog matches</p>
        )}
        {searchQ.data && searchQ.data.length > 0 && (
          <ul className="deck-editor-results">
            {searchQ.data.map((card) => {
              const meta = renderMeta?.(card);
              return (
                <li
                  key={catalogRowKey(card)}
                  className="deck-editor-result"
                  data-catalog-id={card.card_id}
                  data-alt-product-id={card.alt_product_id ?? undefined}
                >
                  <div className="deck-editor-result-main">
                    <CardThumb src={card.image_url || undefined} cardId={card.card_id} alt={card.name} />
                    <div>
                      <div className="card-id">
                        {card.card_id}
                        <AltArtChip card={card} />
                      </div>
                      <div>{card.name}</div>
                      <div className="muted">
                        {[
                          card.color,
                          card.card_type,
                          card.alt_product_id ? card.group_name : "",
                          money(card.market_price),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                      {meta ? <div className="muted deck-editor-result-meta">{meta}</div> : null}
                    </div>
                  </div>
                  <div className="deck-editor-result-actions">{renderAction(card)}</div>
                </li>
              );
            })}
          </ul>
        )}
      </CollapsibleDrawer>
    </div>
  );
}
