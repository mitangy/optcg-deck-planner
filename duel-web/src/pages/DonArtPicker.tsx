import { useEffect, useMemo, useState } from "react";
import { donArtUrl, fallbackToDefaultDon } from "../board/donArt";

type DonPrinting = { productId: number; name: string; set: string };

/** Settings picker for the DON!! card art (#440). The catalog loads on demand, off the board bundle. */
export function DonArtPicker({
  value,
  onChange,
  savedWhere,
}: {
  value: number | null;
  onChange: (productId: number | null) => void;
  savedWhere: string;
}) {
  const [catalog, setCatalog] = useState<DonPrinting[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let live = true;
    import("../assets/donCatalog.json")
      .then((m) => live && setCatalog(m.default as DonPrinting[]))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!catalog || !words.length) return catalog ?? [];
    return catalog.filter((p) => {
      const hay = `${p.name} ${p.set}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [catalog, query]);

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
            {value != null ? (
              <button type="button" className="btn btn-ghost" onClick={() => onChange(null)}>
                Use default
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <div className="field">
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
      <div className="don-art-scroll" role="group" aria-label="DON!! card art">
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
                onClick={() => onChange(p.productId === value ? null : p.productId)}
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
    </div>
  );
}
