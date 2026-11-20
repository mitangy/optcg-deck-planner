import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogTitle } from "@optcg/ui/popups";
import { useAsyncResource } from "../lib/useAsyncResource";
import { donArtUrl, fallbackToDefaultDon } from "../board/don/donArt";

type DonPrinting = { productId: number; name: string; set: string };

export function DonArtPicker({
  value,
  onChange,
  savedWhere,
}: {
  value: number | null;
  onChange: (productId: number | null) => void;
  savedWhere: string;
}) {
  const res = useAsyncResource(() => import("../assets/donCatalog.json").then((m) => m.default as DonPrinting[]), []);
  const catalog = res.status === "ready" ? res.data : null;
  const failed = res.status === "error";
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!catalog || !words.length) return catalog ?? [];
    return catalog.filter((p) => {
      const hay = `${p.name} ${p.set}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [catalog, query]);

  // Bring the current pick into view once the dialog's grid has rendered.
  const ready = open && catalog !== null;
  useEffect(() => {
    if (!ready) return;
    gridRef.current?.querySelector<HTMLElement>(".is-active")?.scrollIntoView?.({ block: "center" });
  }, [ready]);

  function pick(productId: number) {
    onChange(productId);
    setOpen(false);
  }

  const current = value == null ? null : catalog?.find((p) => p.productId === value) ?? null;

  return (
    <div className="don-art-settings">
      <div className="don-art-head">
        <img
          className="don-art-preview"
          src={donArtUrl(value)}
          alt={current ? `Your DON!! card: ${current.name}` : value == null ? "Default DON!! card" : "Your DON!! card"}
          draggable={false}
          onError={fallbackToDefaultDon}
        />
        <div className="don-art-head-body">
          <p className="field-hint">
            {value == null ? "Default DON!! art." : current ? `${current.name} · ${current.set}.` : "Custom DON!! art."}{" "}
            Shown on your DON!! cards; your opponent sees the art they picked on
            their side. {savedWhere}
          </p>
          <div className="btn-row">
            <button
              type="button"
              className={value == null ? "btn btn-primary" : "btn btn-secondary"}
              onClick={() => {
                setQuery("");
                setOpen(true);
              }}
            >
              Change DON!! art
            </button>
            {value != null ? (
              <button type="button" className="btn btn-ghost" onClick={() => onChange(null)}>
                Use default
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        className="don-dialog"
        panelClassName="don-dialog-panel"
        label="Choose DON!! art"
      >
        <div className="don-dialog-head">
          <DialogTitle as="h2" className="don-dialog-title">
            Choose DON!! art
          </DialogTitle>
          <button type="button" className="icon-btn" aria-label="Close" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>
        <div className="field don-dialog-search">
          <label htmlFor="don-art-search">Find DON!! art</label>
          <input
            id="don-art-search"
            type="search"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="Name or set, e.g. Luffy or gold"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="don-art-scroll" role="group" aria-label="DON!! card art" ref={gridRef}>
          {failed ? (
            <p className="error-text">Could not load the DON!! list.</p>
          ) : !catalog ? (
            <p className="field-hint">Loading…</p>
          ) : shown.length === 0 ? (
            <p className="field-hint">No DON!! art matches “{query.trim()}”.</p>
          ) : (
            <div className="don-art-grid">
              {shown.map((p) => (
                <button
                  key={p.productId}
                  type="button"
                  className={`don-art-tile${p.productId === value ? " is-active" : ""}`}
                  aria-pressed={p.productId === value}
                  onClick={() => pick(p.productId)}
                >
                  <img
                    src={donArtUrl(p.productId)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    onError={fallbackToDefaultDon}
                  />
                  <span className="don-art-name">{p.name}</span>
                  <span className="don-art-set">{p.set}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
}
