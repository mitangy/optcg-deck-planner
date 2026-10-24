import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { api, money, type PrintingView } from "./api";
import { CardThumb } from "./CardThumb";
import { InlineSkeleton } from "./Skeleton";

function formatSaleDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function MarketPrice({
  price,
  productId,
}: {
  price: number | null | undefined;
  productId?: number | null;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);
  const canExpand = productId != null && productId > 0;
  const salesQ = useQuery({
    queryKey: ["recent-sales", productId],
    queryFn: () => api.recentSales(productId!),
    enabled: open && canExpand,
    staleTime: 30 * 60 * 1000,
  });

  const place = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const width = 224;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    // Drop below the price; flip above it when the panel would run off the bottom of the screen.
    const height = panelRef.current?.offsetHeight ?? 0;
    const below = rect.bottom + 6;
    const above = rect.top - 6 - height;
    const top = height > 0 && below + height > window.innerHeight - 8 && above >= 8 ? above : below;
    setPanelPos((prev) => (prev && prev.top === top && prev.left === left ? prev : { top, left }));
  }, []);

  // Once the panel (or its sales list) is on screen its height is known, so re-check which side fits.
  const placed = panelPos !== null;
  useLayoutEffect(() => {
    if (open && placed) place();
  }, [open, placed, place, salesQ.isLoading, salesQ.data, salesQ.error]);

  useEffect(() => {
    if (!open) {
      setPanelPos(null);
      return;
    }
    place();
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, place]);

  if (price == null || Number.isNaN(price)) {
    return <span className="muted">—</span>;
  }

  if (!canExpand) {
    return <span>{money(price)}</span>;
  }

  return (
    <div ref={rootRef} className={`market-price${open ? " open" : ""}`}>
      <button
        ref={btnRef}
        type="button"
        className="market-price-btn"
        aria-expanded={open}
        title="Show last 3 sold prices"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{money(price)}</span>
        <span className="market-price-chevron" aria-hidden="true">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && panelPos && (
        <div
          ref={panelRef}
          className="market-sales"
          role="region"
          aria-label="Last 3 sold prices"
          style={{ top: panelPos.top, left: panelPos.left }}
        >
          <div className="market-sales-head">Last 3 sold</div>
          {salesQ.isLoading && <InlineSkeleton lines={3} label="Loading recent sales…" />}
          {salesQ.error && (
            <p className="error market-sales-status">{(salesQ.error as Error).message}</p>
          )}
          {salesQ.data && salesQ.data.sales.length === 0 && (
            <p className="muted market-sales-status">No recent sales</p>
          )}
          {salesQ.data && salesQ.data.sales.length > 0 && (
            <ul className="market-sales-list">
              {salesQ.data.sales.map((sale, idx) => (
                <li key={`${sale.order_date}-${sale.price}-${idx}`}>
                  <span className="market-sale-price">{money(sale.price)}</span>
                  <span className="market-sale-meta">
                    {[sale.condition, sale.variant, formatSaleDate(sale.order_date)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Base art shown as the small "Base" tile once an alt art is the main image. */
export type BaseArt = {
  name: string;
  image_url?: string;
  market_price: number | null | undefined;
  product_id?: number | null;
};

function AltStepper({
  caption,
  verb,
  name,
  value,
  busy,
  disableInc = false,
  incTitle,
  onChange,
}: {
  caption: string;
  verb: string;
  name: string;
  value: number;
  busy: boolean;
  disableInc?: boolean;
  incTitle?: string;
  onChange: (qty: number) => void;
}) {
  return (
    <span className="alt-want-controls">
      <span className="alt-want-caption">{caption}</span>
      <span className="owned-wrap alt-want-wrap">
        <button
          type="button"
          className="owned-btn"
          aria-label={`Decrease ${verb} for ${name}`}
          disabled={busy || value <= 0}
          onClick={() => onChange(Math.max(0, value - 1))}
        >
          −
        </button>
        <span className="alt-want-qty" aria-label={`${name} ${verb === "owned" ? "owned" : "wanted"}`}>
          {value}
        </span>
        <button
          type="button"
          className="owned-btn"
          aria-label={`Increase ${verb} for ${name}`}
          disabled={busy || disableInc}
          title={incTitle}
          onClick={() => onChange(value + 1)}
        >
          +
        </button>
      </span>
    </span>
  );
}

/**
 * Alt-art tiles for a card. Planner pages edit how many copies of each alt the
 * user owns (`onOwnedChange`). Group buys keep their per-order wants
 * (`onWantChange`, capped by `cardNeeded`). `base` prepends a "Base" tile when
 * an owned alt has taken over as the main image.
 */
export function AltArtsRow({
  alts,
  cardNeeded,
  editable = false,
  onOwnedChange,
  onWantChange,
  busyProductId = null,
  base = null,
  baseOwnedControl,
  cardId,
  shownProductId = null,
  onShow,
}: {
  alts: PrintingView[] | null | undefined;
  /** Group buys only: the want cap. */
  cardNeeded?: number;
  editable?: boolean;
  onOwnedChange?: (productId: number, qty: number) => void;
  onWantChange?: (productId: number, qty: number) => void;
  busyProductId?: number | null;
  base?: BaseArt | null;
  /** Owned stepper for the base count, shown inside the Base tile. */
  baseOwnedControl?: ReactNode;
  /** Falls back to the card's preview art when an alt (or the base) has none of its own. */
  cardId?: string | null;
  /** Product id of the art currently shown as the card's picture (0/null = base). */
  shownProductId?: number | null;
  /** Makes a tile the card's picture (0 = base). Adds a Show control to every tile. */
  onShow?: (productId: number) => void;
}) {
  const list = alts ?? [];
  if (!list.length) return <span className="muted">—</span>;
  const wantSum = list.reduce((s, a) => s + (a.wanted ?? 0), 0);
  const atCap = cardNeeded != null && wantSum >= cardNeeded;
  const shown = shownProductId ?? 0;
  const showControl = (productId: number, name: string) =>
    onShow ? (
      productId === shown ? (
        <span className="alt-shown-chip">Shown</span>
      ) : (
        <button
          type="button"
          className="alt-show-btn"
          aria-label={`Show ${name} as the card's art`}
          onClick={() => onShow(productId)}
        >
          Show
        </button>
      )
    ) : null;

  return (
    <div className="alt-arts">
      {base && (
        <div className="alt-art alt-art-base">
          <CardThumb src={base.image_url || undefined} cardId={cardId} alt={`${base.name} base art`} />
          <div className="alt-meta">
            <MarketPrice price={base.market_price} productId={base.product_id} />
            {baseOwnedControl}
            <span className="alt-base-label">Base</span>
            {showControl(0, `${base.name} base art`)}
          </div>
        </div>
      )}
      {list.map((alt) => {
        const wanted = alt.wanted ?? 0;
        const owned = alt.owned ?? 0;
        const busy = busyProductId === alt.product_id;
        return (
          <div key={alt.product_id} className="alt-art">
            <CardThumb src={alt.image_url || undefined} cardId={cardId} alt={alt.name} />
            <div className="alt-meta">
              <MarketPrice price={alt.market_price} productId={alt.product_id} />
              {editable && onOwnedChange ? (
                <AltStepper
                  caption="Owned"
                  verb="owned"
                  name={alt.name}
                  value={owned}
                  busy={busy}
                  onChange={(qty) => onOwnedChange(alt.product_id, qty)}
                />
              ) : editable && onWantChange ? (
                <AltStepper
                  caption="Want"
                  verb="want"
                  name={alt.name}
                  value={wanted}
                  busy={busy}
                  disableInc={atCap}
                  incTitle={atCap ? `Cannot exceed Need (${cardNeeded})` : undefined}
                  onChange={(qty) => onWantChange(alt.product_id, qty)}
                />
              ) : onWantChange ? (
                wanted > 0 ? (
                  <span className="alt-want-label" title="Wanted for play in deck">
                    Want ×{wanted}
                  </span>
                ) : null
              ) : owned > 0 ? (
                <span className="alt-want-label" title="Copies of this alt you own">
                  Own ×{owned}
                </span>
              ) : null}
              {alt.tcgplayer_url ? (
                <a href={alt.tcgplayer_url} target="_blank" rel="noreferrer" title={alt.name}>
                  Alt
                </a>
              ) : (
                <span className="muted" title={alt.name}>
                  Alt
                </span>
              )}
              {showControl(alt.product_id, alt.name)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
