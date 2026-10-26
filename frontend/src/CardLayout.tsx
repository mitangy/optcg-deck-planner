import { useEffect, useState } from "react";

export type CardLayout = "list" | "grid";

const CARD_LAYOUT_KEY = "optcg_card_layout";

export function useCardLayout() {
  const [layout, setLayout] = useState<CardLayout>(() => {
    try {
      return localStorage.getItem(CARD_LAYOUT_KEY) === "grid" ? "grid" : "list";
    } catch {
      return "list";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(CARD_LAYOUT_KEY, layout);
    } catch {
      /* ignore */
    }
  }, [layout]);
  return [layout, setLayout] as const;
}

export function CardLayoutToggle({
  layout,
  onChange,
  icons = false,
}: {
  layout: CardLayout;
  onChange: (next: CardLayout) => void;
  /** A list / grid glyph before each label. */
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
