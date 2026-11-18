import { CARD_LAYOUT_KEY, LIST_DENSITY_KEYS } from "../storage/keys";
import { choiceCodec, usePersistedState } from "@optcg/ui/storage";

export type CardLayout = "list" | "grid";

const layoutCodec = choiceCodec<CardLayout>(["list", "grid"]);

export function useCardLayout() {
  return usePersistedState<CardLayout>(CARD_LAYOUT_KEY, "list", layoutCodec);
}

export type ListDensity = "comfortable" | "compact";
export type DensityPage = keyof typeof LIST_DENSITY_KEYS;

const densityCodec = choiceCodec<ListDensity>(["comfortable", "compact"]);

/** Shopping and Collection are long lists, so they start Compact; deck pages and the share page keep the roomy rows. */
export function defaultListDensity(page: DensityPage): ListDensity {
  return page === "shopping" || page === "collection" ? "compact" : "comfortable";
}

/** Density of the List view, remembered per page; a saved choice wins over the page default. */
export function useListDensity(page: DensityPage) {
  return usePersistedState<ListDensity>(LIST_DENSITY_KEYS[page], defaultListDensity(page), densityCodec);
}

export function DensityToggle({ density, onChange, hidden = false }: { density: ListDensity; onChange: (next: ListDensity) => void; hidden?: boolean }) {
  return (
    <div className="layout-toggle with-icons density-toggle" role="group" aria-label="List density" style={hidden ? { visibility: "hidden" } : undefined}>
      <button
        type="button"
        className={density === "comfortable" ? "active" : ""}
        aria-pressed={density === "comfortable"}
        title="Comfortable: big card art"
        onClick={() => onChange("comfortable")}
      >
        <svg {...glyph}>
          <rect x="2.5" y="2.5" width="11" height="4.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <rect x="2.5" y="9" width="11" height="4.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <span className="layout-label">Comfortable</span>
      </button>
      <button
        type="button"
        className={density === "compact" ? "active" : ""}
        aria-pressed={density === "compact"}
        title="Compact: small card art, more rows"
        onClick={() => onChange("compact")}
      >
        <svg {...glyph}>
          <path d="M2.5 3h11M2.5 6.5h11M2.5 10h11M2.5 13.5h11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="layout-label">Compact</span>
      </button>
    </div>
  );
}

export function CardLayoutToggle({
  layout,
  onChange,
  icons = false,
}: {
  layout: CardLayout;
  onChange: (next: CardLayout) => void;
  icons?: boolean;
}) {
  return (
    <div className={`layout-toggle${icons ? " with-icons" : ""}`} role="group" aria-label="Card layout">
      <button
        type="button"
        className={layout === "list" ? "active" : ""}
        aria-pressed={layout === "list"}
        onClick={() => onChange("list")}
      >
        {icons ? <ListGlyph /> : null}
        <span className="layout-label">List</span>
      </button>
      <button
        type="button"
        className={layout === "grid" ? "active" : ""}
        aria-pressed={layout === "grid"}
        onClick={() => onChange("grid")}
      >
        {icons ? <GridGlyph /> : null}
        <span className="layout-label">Grid</span>
      </button>
    </div>
  );
}

const glyph = { viewBox: "0 0 16 16", width: 16, height: 16, "aria-hidden": true, focusable: false, className: "layout-glyph" } as const;

function ListGlyph() {
  return (
    <svg {...glyph}>
      <path d="M5.5 3.5h8M5.5 8h8M5.5 12.5h8M2 3.5h.01M2 8h.01M2 12.5h.01" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function GridGlyph() {
  return (
    <svg {...glyph}>
      <g fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="2" width="5" height="5" rx="1" />
        <rect x="9" y="2" width="5" height="5" rx="1" />
        <rect x="2" y="9" width="5" height="5" rx="1" />
        <rect x="9" y="9" width="5" height="5" rx="1" />
      </g>
    </svg>
  );
}
