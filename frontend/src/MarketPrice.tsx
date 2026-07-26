import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);
  const canExpand = productId != null && productId > 0;
  const salesQ = useQuery({
    queryKey: ["recent-sales", productId],
    queryFn: () => api.recentSales(productId!),
    enabled: open && canExpand,
    staleTime: 30 * 60 * 1000,
  });

  useEffect(() => {
    if (!open) {
      setPanelPos(null);
      return;
    }
    function place() {
      const btn = btnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const width = 224;
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
      setPanelPos({ top: rect.bottom + 6, left });
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
  }, [open]);

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

export function AltArtsRow({ alts }: { alts: PrintingView[] }) {
  if (!alts.length) return <span className="muted">—</span>;
  return (
    <div className="alt-arts">
      {alts.map((alt) => (
        <div key={alt.product_id} className="alt-art">
          <CardThumb src={alt.image_url || undefined} alt={alt.name} />
          <div className="alt-meta">
            <MarketPrice price={alt.market_price} productId={alt.product_id} />
            {alt.tcgplayer_url ? (
              <a href={alt.tcgplayer_url} target="_blank" rel="noreferrer" title={alt.name}>
                Alt
              </a>
            ) : (
              <span className="muted" title={alt.name}>
                Alt
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
