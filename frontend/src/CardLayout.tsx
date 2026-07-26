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
}: {
  layout: CardLayout;
  onChange: (next: CardLayout) => void;
}) {
  return (
    <div className="layout-toggle" role="group" aria-label="Card layout">
      <button
        type="button"
        className={layout === "list" ? "active" : ""}
        aria-pressed={layout === "list"}
        onClick={() => onChange("list")}
      >
        List
      </button>
      <button
        type="button"
        className={layout === "grid" ? "active" : ""}
        aria-pressed={layout === "grid"}
        onClick={() => onChange("grid")}
      >
        Grid
      </button>
    </div>
  );
}
