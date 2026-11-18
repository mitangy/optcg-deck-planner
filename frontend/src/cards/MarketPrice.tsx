import { useQuery } from "@tanstack/react-query";
import { useContext, type ReactNode } from "react";
import { Popover, PopoverButton, PopoverPanel } from "@optcg/ui/popups";
import { api, money, type PrintingView } from "../api";
import { CardThumb } from "../ui/CardThumb";
import { AltTrayContext } from "./AltTray";
import { InlineSkeleton } from "../ui/Skeleton";
import { qk } from "../cache/queryKeys";

function formatSaleDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function RecentSales({ productId }: { productId: number }) {
  const salesQ = useQuery({
    queryKey: qk.recentSales(productId),
    queryFn: () => api.recentSales(productId),
    staleTime: 30 * 60 * 1000,
  });
  return (
    <>
      <div className="market-sales-head">Last 3 sold</div>
      {salesQ.isLoading && <InlineSkeleton lines={3} label="Loading recent sales…" />}
      {salesQ.error && <p className="error market-sales-status">{(salesQ.error as Error).message}</p>}
      {salesQ.data && salesQ.data.sales.length === 0 && <p className="muted market-sales-status">No recent sales</p>}
      {salesQ.data && salesQ.data.sales.length > 0 && (
        <ul className="market-sales-list">
          {salesQ.data.sales.map((sale, idx) => (
            <li key={`${sale.order_date}-${sale.price}-${idx}`}>
              <span className="market-sale-price">{money(sale.price)}</span>
              <span className="market-sale-meta">
                {[sale.condition, sale.variant, formatSaleDate(sale.order_date)].filter(Boolean).join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function MarketPrice({
  price,
  productId,
}: {
  price: number | null | undefined;
  productId?: number | null;
}) {
  if (price == null || Number.isNaN(price)) {
    return <span className="muted">—</span>;
  }

  if (productId == null || productId <= 0) {
    return <span>{money(price)}</span>;
  }

  return (
    <Popover as="div" className={({ open }: { open: boolean }) => `market-price${open ? " open" : ""}`}>
      {({ open }: { open: boolean }) => (
        <>
          <PopoverButton type="button" className="market-price-btn" title="Show last 3 sold prices">
            <span>{money(price)}</span>
            <span className="market-price-chevron" aria-hidden="true">
              {open ? "▴" : "▾"}
            </span>
          </PopoverButton>
          <PopoverPanel
            anchor={{ to: "bottom start", gap: 6, padding: 8 }}
            role="region"
            aria-label="Last 3 sold prices"
            className="market-sales"
          >
            <RecentSales productId={productId} />
          </PopoverPanel>
        </>
      )}
    </Popover>
  );
}

export type BaseArt = {
  name: string;
  image_url?: string;
  market_price: number | null | undefined;
  product_id?: number | null;
};

function ExtraCopyConfirm({ name, disabled, onConfirm }: { name: string; disabled: boolean; onConfirm: () => void }) {
  return (
    <Popover as="div" className="alt-extra-pop">
      {({ close }: { close: () => void }) => (
        <>
          <PopoverButton
            type="button"
            className="alt-collector-btn"
            aria-label={`Want an extra ${name} on top of your decks`}
            title="Want one more copy of this art, on top of what your decks need"
            disabled={disabled}
          >
            + Extra copy
          </PopoverButton>
          <PopoverPanel
            anchor={{ to: "bottom", gap: 6, padding: 8 }}
            role="dialog"
            aria-label={`Add an extra ${name}?`}
            className="alt-extra-confirm"
          >
            <p className="alt-extra-confirm-text">Your deck copy is already this art. Add an extra one on top?</p>
            <div className="alt-extra-confirm-actions">
              <button
                type="button"
                className="alt-extra-confirm-yes"
                onClick={() => {
                  close();
                  onConfirm();
                }}
              >
                Add extra copy
              </button>
              <button type="button" className="alt-extra-confirm-no" onClick={() => close()}>
                Cancel
              </button>
            </div>
          </PopoverPanel>
        </>
      )}
    </Popover>
  );
}

export function AltStepper({
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

export function AltArtsRow({
  alts,
  cardNeeded,
  blockWantInc = false,
  blockWantIncTitle,
  editable = false,
  onOwnedChange,
  onWantChange,
  altBuyQty,
  showBuyPicks = false,
  busyProductId = null,
  base = null,
  baseOwnedControl,
  cardId,
  shownProductId = null,
  onShow,
  tileExtra,
  onCollectorChange,
  collectorBusyProductId = null,
}: {
  alts: PrintingView[] | null | undefined;
  cardNeeded?: number;
  blockWantInc?: boolean;
  blockWantIncTitle?: string;
  editable?: boolean;
  onOwnedChange?: (productId: number, qty: number) => void;
  onWantChange?: (productId: number, qty: number) => void;
  altBuyQty?: (productId: number) => number;
  showBuyPicks?: boolean;
  busyProductId?: number | null;
  base?: BaseArt | null;
  baseOwnedControl?: ReactNode;
  cardId?: string | null;
  shownProductId?: number | null;
  onShow?: (productId: number) => void;
  tileExtra?: (productId: number) => ReactNode;
  onCollectorChange?: (productId: number, qty: number) => void;
  collectorBusyProductId?: number | null;
}) {
  const inTray = useContext(AltTrayContext);
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

  const tileFoot = (productId: number, name: string, collector: ReactNode = null) => {
    const show = showControl(productId, name);
    if (!tileExtra && !show && !collector) return null;
    return (
      <div className="alt-art-foot">
        {collector}
        {tileExtra ? <div className="alt-art-extra">{tileExtra(productId)}</div> : null}
        {show}
      </div>
    );
  };

  const tiles = (
    <div className={onCollectorChange ? "alt-arts alt-arts-collect" : "alt-arts"}>
      <div className="alt-arts-grid">
        {base && (
          <div className="alt-art alt-art-base">
            <div className="alt-art-main">
              <CardThumb src={base.image_url || undefined} cardId={cardId} alt={`${base.name} base art`} productId={0} />
              <div className="alt-meta">
                <MarketPrice price={base.market_price} productId={base.product_id} />
                <span className="alt-base-label">Base</span>
                {baseOwnedControl}
              </div>
            </div>
            {tileFoot(0, `${base.name} base art`)}
          </div>
        )}
        {list.map((alt) => {
          const wanted = alt.wanted ?? 0;
          const owned = alt.owned ?? 0;
          const busy = busyProductId === alt.product_id;
          const showBuyLine = Boolean(altBuyQty && editable && onWantChange && !onOwnedChange && (wanted > 0 || owned > 0));
          const collector =
            onCollectorChange ? (
              (alt.collector ?? 0) > 0 ? (
                <button
                  type="button"
                  className="alt-collector-btn is-on"
                  aria-pressed={true}
                  aria-label={`Remove extra ${alt.name}`}
                  title="Remove the extra copy"
                  disabled={collectorBusyProductId === alt.product_id}
                  onClick={() => onCollectorChange(alt.product_id, 0)}
                >
                  ★ Extra copy{(alt.collector ?? 0) > 1 ? ` ×${alt.collector}` : ""}
                </button>
              ) : wanted > 0 ? (
                <ExtraCopyConfirm
                  name={alt.name}
                  disabled={collectorBusyProductId === alt.product_id}
                  onConfirm={() => onCollectorChange(alt.product_id, 1)}
                />
              ) : (
                <button
                  type="button"
                  className="alt-collector-btn"
                  aria-pressed={false}
                  aria-label={`Want an extra ${alt.name} on top of your decks`}
                  title="Want one more copy of this art, on top of what your decks need"
                  disabled={collectorBusyProductId === alt.product_id}
                  onClick={() => onCollectorChange(alt.product_id, 1)}
                >
                  + Extra copy
                </button>
              )
            ) : (alt.collector ?? 0) > 0 ? (
              <span className="alt-collector" title="You want one more copy of this art, on top of your decks">
                ★ Extra copy
              </span>
            ) : null;
          return (
            <div key={alt.product_id} className="alt-art">
              <div className="alt-art-main">
                <CardThumb src={alt.image_url || undefined} cardId={cardId} alt={alt.name} productId={alt.product_id} />
                <div className="alt-meta">
                  <MarketPrice price={alt.market_price} productId={alt.product_id} />
                  {showBuyPicks && wanted > 0 ? (
                    <span className="alt-want-label" title="Copies on your list that you buy as this art">
                      Buying ×{wanted}
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
                  {showBuyLine && altBuyQty ? (
                    <span
                      className="alt-want-label alt-buy-label"
                      title="Copies you buy as this art (copies you own count first)"
                    >
                      <span className="alt-buy-own">Buy ×{altBuyQty(alt.product_id)}</span>
                      {owned > 0 ? (
                        <>
                          <span className="alt-buy-sep" aria-hidden="true">
                            {" · "}
                          </span>
                          <span className="alt-buy-own alt-buy-owned">own {owned}</span>
                        </>
                      ) : null}
                    </span>
                  ) : null}
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
                      caption={owned > 0 && !showBuyLine ? `Want · own ${owned}` : "Want"}
                      verb="want"
                      name={alt.name}
                      value={wanted}
                      busy={busy}
                      disableInc={atCap || blockWantInc}
                      incTitle={
                        blockWantInc
                          ? blockWantIncTitle
                          : atCap
                            ? `Cannot exceed Need (${cardNeeded})`
                            : undefined
                      }
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
                </div>
              </div>
              {tileFoot(alt.product_id, alt.name, collector)}
            </div>
          );
        })}
      </div>
    </div>
  );
  if (!inTray) return tiles;
  return (
    <div className="alt-tray">
      <div className="alt-tray-label">Alt arts · {list.length + (base ? 1 : 0)}</div>
      {tiles}
    </div>
  );
}
