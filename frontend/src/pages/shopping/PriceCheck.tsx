import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api, money, type CatalogCardResult } from "../../api";
import { MarketPrice } from "../../cards/MarketPrice";
import { qk } from "../../cache/queryKeys";
import { CATALOG_SEARCH_DEBOUNCE_MS } from "../../hooks/useCatalogSearch";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { PRICE_CHECK_RECENTS_KEY } from "../../storage/keys";
import { CardThumb } from "../../ui/CardThumb";
import { CardSearchInput } from "../../ui/cardListControls";
import { InlineSkeleton } from "../../ui/Skeleton";
import { AltArtChip } from "../collection/CatalogAddDrawer";
import { CollectionAltControl, CollectionOwnedControl } from "../collection/CollectionAddPanel";
import { priceCheckOwned } from "./priceCheckOwned";
import { recentKey, recentLookupsCodec, withRecentLookup } from "./priceCheckRecents";
import { Dialog, DialogTitle } from "@optcg/ui/popups";
import { usePersistedState } from "@optcg/ui/storage";

function typingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

const OPEN_EVENT = "price-check:open";

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12.7 12.7 17 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** "Price check" beside Scan in the list toolbar: on a computer the head has no room for the field once the totals show (#1342). */
export function PriceCheckToolbarButton() {
  return (
    <button
      type="button"
      className="ghost price-check-toolbar-btn"
      aria-haspopup="dialog"
      title="Price check (/)"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
    >
      <SearchIcon />
      Price check
    </button>
  );
}

/** Search-looking button at the top of Master Shopping; opens a full-screen (phone) or centred (desktop) price lookup. */
export function PriceCheck() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      if (typingTarget(e.target) || document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        className="price-check-trigger"
        aria-haspopup="dialog"
        aria-label="Price check: name or set code"
        title="Price check (/)"
        onClick={() => setOpen(true)}
      >
        <SearchIcon className="price-check-trigger-icon" />
        <span className="price-check-trigger-text">Price check: name or set code</span>
        <kbd className="price-check-kbd" aria-hidden="true">
          /
        </kbd>
      </button>
      {open ? <PriceCheckDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function PriceCheckDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const trimmed = query.trim();
  const debouncedQ = useDebouncedValue(query, CATALOG_SEARCH_DEBOUNCE_MS).trim();
  // Always alt rows, whatever the Show alt arts setting says: in a store you want the price of the art in your hand.
  const searchQ = useQuery({
    queryKey: qk.catalogSearch.priceCheck(debouncedQ),
    queryFn: () => api.searchCatalog({ q: debouncedQ, alts: true, limit: 40 }),
    enabled: debouncedQ !== "",
    placeholderData: keepPreviousData,
  });

  // Counts come from the live collection (shared cache with Shopping), never from a search row or a stored recent: those are snapshots.
  const ownedQ = useQuery({ queryKey: qk.owned.all(), queryFn: () => api.ownedCollection() });
  const ownedItems = ownedQ.data?.items;
  const ownedOf = ownedItems ? (card: CatalogCardResult) => priceCheckOwned(ownedItems, card) : null;

  const [stored, setStored] = usePersistedState<CatalogCardResult[]>(PRICE_CHECK_RECENTS_KEY, [], recentLookupsCodec);
  // Recents are listed as they were when the list was last shown: tapping a price must not move the row under the finger.
  const [shownRecents, setShownRecents] = useState(stored);
  const idle = trimmed === "";
  const wasIdle = useRef(true);
  useEffect(() => {
    if (idle && !wasIdle.current) setShownRecents(stored);
    wasIdle.current = idle;
  }, [idle, stored]);

  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = window.setTimeout(() => bodyRef.current?.querySelector<HTMLInputElement>("input")?.focus(), 0);
    return () => window.clearTimeout(t);
  }, []);

  const looked = (card: CatalogCardResult) => setStored((prev) => withRecentLookup(prev, card));

  let body;
  if (idle) {
    body = (
      <>
        {shownRecents.length === 0 ? (
          <p className="muted price-check-hint">Search by name, set code (like OP14-033), effect or type. Alt arts show as their own rows.</p>
        ) : (
          <>
            <div className="price-check-section">
              <h3>Recent lookups</h3>
              <button
                type="button"
                className="ghost price-check-clear-recents"
                onClick={() => {
                  setStored([]);
                  setShownRecents([]);
                }}
              >
                Clear
              </button>
            </div>
            <ul className="price-check-list">
              {shownRecents.map((card) => (
                <PriceCheckRow key={recentKey(card)} card={card} onLookup={looked} ownedOf={ownedOf} />
              ))}
            </ul>
          </>
        )}
      </>
    );
  } else if (searchQ.isError && !searchQ.data) {
    body = <p className="error price-check-hint">{(searchQ.error as Error).message}</p>;
  } else if (!searchQ.data) {
    body = <InlineSkeleton lines={3} label="Searching prices…" />;
  } else if (searchQ.data.length === 0 && debouncedQ === trimmed) {
    body = <p className="muted price-check-hint">No cards match “{trimmed}”.</p>;
  } else {
    body = (
      <ul className="price-check-list" aria-busy={debouncedQ !== trimmed || searchQ.isFetching}>
        {searchQ.data.map((card) => (
          <PriceCheckRow key={recentKey(card)} card={card} onLookup={looked} ownedOf={ownedOf} />
        ))}
      </ul>
    );
  }

  return (
    <Dialog open onClose={onClose} className="price-check-dialog" panelClassName="price-check-panel" label="Price check">
      <div className="price-check-head" ref={bodyRef}>
        <DialogTitle as="h2" className="price-check-title">
          Price check
        </DialogTitle>
        <div className="price-check-search">
          <CardSearchInput value={query} onChange={setQuery} placeholder="Name or set code" label="Search card prices" icon />
        </div>
        <button type="button" className="ghost price-check-close" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="price-check-results">{body}</div>
      <p className="muted price-check-foot">TCGPlayer prices. New sets update hourly.</p>
    </Dialog>
  );
}

/** Add / stepper for one row. Disabled "Add" in the same box until the live count is known, so a tap cannot overwrite a saved count. */
function PriceCheckOwned({ card, owned }: { card: CatalogCardResult; owned: number | null }) {
  if (owned === null) {
    return (
      <span className="collection-owned-control">
        <button type="button" className="btn secondary" disabled aria-label={`Add ${card.card_id} to collection`}>
          Add
        </button>
      </span>
    );
  }
  return card.alt_product_id ? (
    <CollectionAltControl card={{ ...card, owned }} onSaved={() => {}} />
  ) : (
    <CollectionOwnedControl cardId={card.card_id} owned={owned} onSaved={() => {}} />
  );
}

function PriceCheckRow({
  card,
  onLookup,
  ownedOf,
}: {
  card: CatalogCardResult;
  onLookup: (card: CatalogCardResult) => void;
  ownedOf: ((card: CatalogCardResult) => number) | null;
}) {
  // Taps inside the enlarged-card overlay bubble through React portals, so match the actual buttons.
  const hit = (selector: string) => (e: React.MouseEvent) => {
    if ((e.target as Element).closest(selector)) onLookup(card);
  };
  return (
    <li className="price-check-row">
      <div className="price-check-thumb" onClickCapture={hit(".thumb-btn")}>
        <CardThumb src={card.image_url} cardId={card.card_id} alt="" productId={card.product_id ?? undefined} />
      </div>
      <div className="price-check-main">
        <div className="price-check-name" title={card.name}>
          {card.name}
        </div>
        <div className="price-check-id">
          {card.card_id}
          <AltArtChip card={card} />
        </div>
        {card.group_name ? <div className="muted price-check-set">{card.group_name}</div> : null}
        <div className="price-check-owned">
          <PriceCheckOwned card={card} owned={ownedOf ? ownedOf(card) : null} />
        </div>
      </div>
      <div className="price-check-price" onClickCapture={hit(".market-price-btn")}>
        <span className="price-check-market">
          <MarketPrice price={card.market_price} productId={card.product_id} />
        </span>
        <span className="muted price-check-low">Low {money(card.low_price)}</span>
      </div>
    </li>
  );
}
