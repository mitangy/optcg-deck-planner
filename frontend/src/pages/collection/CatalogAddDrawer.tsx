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

export function catalogRowKey(card: CatalogCardResult): string {
  return `${card.card_id}:${card.alt_product_id ?? 0}`;
}

export function AltArtChip({ card }: { card: CatalogCardResult }) {
  return card.alt_product_id ? <span className="alt-art-chip">Alt art</span> : null;
}

export function CatalogAddDrawer({
  className,
  label = "Add cards",
  summary,
  storageKey,
  defaultOpen,
  idleHint,
  onScan,
  renderMeta,
  renderAction,
  bare = false,
  searchPlaceholder,
  searchLabel,
  searchIcon,
}: {
  className?: string;
  /** Drawer title (default "Add cards"). */
  label?: string;
  summary: string;
  storageKey: string;
  defaultOpen: boolean;
  idleHint: string;
  /** Render just the search and results, with no collapsible bar (for a panel that is already an overlay). */
  bare?: boolean;
  searchPlaceholder?: string;
  searchLabel?: string;
  searchIcon?: boolean | "search" | "filter";
  onScan?: () => void;
  renderMeta?: (card: CatalogCardResult) => ReactNode;
  renderAction: (card: CatalogCardResult) => ReactNode;
}) {
  const { query, setQuery, color, setColor, cardType, setCardType, searchEnabled, searchQ } = useCatalogSearch({
    colorKey: `${storageKey}_color`,
    typeKey: `${storageKey}_card_type`,
  });

  const body = (
    <>
        <div className="deck-editor-filters">
          <CardSearchInput value={query} onChange={setQuery} placeholder={searchPlaceholder} label={searchLabel} icon={searchIcon} />
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
    </>
  );

  if (bare) return <div className={`deck-editor ${className ?? ""}`.trim()}>{body}</div>;
  return (
    <div className={`deck-editor ${className ?? ""}`.trim()}>
      <CollapsibleDrawer label={label} summary={summary} storageKey={storageKey} defaultOpen={defaultOpen}>
        {body}
      </CollapsibleDrawer>
    </div>
  );
}
