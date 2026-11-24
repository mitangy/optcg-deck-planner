import { useEffect, useRef, useState } from "react";
import { useMediaQuery } from "@optcg/ui/hooks";
import { Dialog } from "@optcg/ui/popups";
import type { DeckStatsCard } from "@optcg/deck-analytics";
import { DECK_STATS_COLLAPSED_KEY } from "../../storage/keys";
import { bool01, usePersistedState } from "@optcg/ui/storage";
import { DeckStatsPanel, type HintsState } from "@optcg/deck-analytics/ui";

export const DOCK_QUERY = "(min-width: 1200px)";
/** Wide and tall enough to keep the stats under the Add cards panel while editing (#1342). */
export const STACK_QUERY = "(min-width: 1600px) and (min-height: 760px)";

/**
 * Where the stats live: "dock" is the right column, "stack" sits under the Add cards panel while editing,
 * "sheet" is a bottom sheet that the header Stats button opens.
 */
export type StatsMode = "dock" | "stack" | "sheet";

export function useStatsMode(editing: boolean): StatsMode {
  const docked = useMediaQuery(DOCK_QUERY);
  const stackable = useMediaQuery(STACK_QUERY);
  if (!docked) return "sheet";
  if (!editing) return "dock";
  return stackable ? "stack" : "sheet";
}

function useStatsCollapsed() {
  return usePersistedState(DECK_STATS_COLLAPSED_KEY, false, bool01);
}

function StatsIcon() {
  return (
    <svg className="stats-dock-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M2 14V8h3v6zM6.5 14V2h3v12zM11 14V5h3v9z" fill="currentColor" />
    </svg>
  );
}

/** Header button that opens the stats sheet. Nothing floats over the card list. */
export function StatsButton({ hints, open, onClick }: { hints?: HintsState; open: boolean; onClick: () => void }) {
  const badge = hints && hints.visible.length > 0 ? hints.visible.length : 0;
  return (
    <button
      type="button"
      className="btn quiet deck-stats-btn"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={badge ? `Deck stats, ${badge} build hints` : "Deck stats"}
      title="Deck stats"
      onClick={onClick}
    >
      <StatsIcon />
      <span className="deck-stats-btn-label">Stats</span>
      {badge ? (
        <span className="filter-drawer-badge deck-stats-btn-badge" aria-hidden="true">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

/** The stats panel as a card of its own, for the column under the Add cards panel. */
export function DeckStatsBox({ cards, leaderId, hints }: { cards: DeckStatsCard[]; leaderId: string | null; hints?: HintsState }) {
  return (
    <aside className="stats-dock-panel deck-stats stats-stack" aria-label="Deck stats">
      <div className="stats-dock-head">
        <h2>Deck stats</h2>
      </div>
      <div className="stats-dock-scroll">
        <DeckStatsPanel cards={cards} leaderId={leaderId} hints={hints} />
      </div>
    </aside>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d={dir === "right" ? "M6 3l5 5-5 5" : "M10 3L5 8l5 5"} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DeckStatsDock({
  cards,
  leaderId,
  hints,
  mode,
  sheetOpen,
  onSheetOpenChange,
}: {
  cards: DeckStatsCard[];
  leaderId: string | null;
  hints?: HintsState;
  mode: StatsMode;
  sheetOpen: boolean;
  onSheetOpenChange: (open: boolean) => void;
}) {
  const [collapsed, setCollapsed] = useStatsCollapsed();
  const collapseRef = useRef<HTMLButtonElement>(null);
  const railRef = useRef<HTMLButtonElement>(null);
  const toggled = useRef(false);
  const badge = hints && hints.visible.length > 0 ? hints.visible.length : 0;
  const badgeEl = badge ? (
    <span className="filter-drawer-badge" aria-label={`${badge} build hints`}>
      {badge}
    </span>
  ) : null;

  useEffect(() => {
    if (!toggled.current) return;
    toggled.current = false;
    (collapsed ? railRef.current : collapseRef.current)?.focus();
  }, [collapsed]);
  const toggle = (next: boolean) => {
    toggled.current = true;
    setCollapsed(next);
  };

  if (mode === "stack") return null;

  if (mode === "dock") {
    if (collapsed) {
      return (
        <aside className="stats-dock stats-dock-collapsed" aria-label="Deck stats">
          <button ref={railRef} type="button" className="stats-rail" aria-expanded={false} aria-label={badge ? `Expand deck stats, ${badge} build hints` : "Expand deck stats"} onClick={() => toggle(false)}>
            <Chevron dir="left" />
            <StatsIcon />
            {badgeEl}
            <span className="stats-rail-label">Stats</span>
          </button>
        </aside>
      );
    }
    return (
      <aside className="stats-dock" aria-label="Deck stats">
        <div className="stats-dock-panel deck-stats">
          <div className="stats-dock-head">
            <h2>Deck stats</h2>
            <button ref={collapseRef} type="button" className="ghost stats-dock-collapse" aria-expanded aria-label="Collapse deck stats" onClick={() => toggle(true)}>
              <Chevron dir="right" />
            </button>
          </div>
          <div className="stats-dock-scroll">
            <DeckStatsPanel cards={cards} leaderId={leaderId} hints={hints} />
          </div>
        </div>
      </aside>
    );
  }

  const close = () => onSheetOpenChange(false);
  const sheetHints: HintsState | undefined = hints?.onAsk
    ? {
        ...hints,
        onAsk: (h) => {
          close();
          hints.onAsk!(h);
        },
      }
    : hints;

  // Mounts only while open. Headless UI traps Tab, closes on Escape / outside click, locks page scroll and
  // hands focus back to the header Stats button.
  return sheetOpen ? (
    <Dialog open onClose={close} className="stats-sheet-backdrop" panelClassName="stats-sheet deck-stats" label="Deck stats">
      <div className="stats-dock-head">
        <h2>Deck stats</h2>
        <button type="button" className="ghost stats-dock-collapse" onClick={close}>
          Close
        </button>
      </div>
      <div className="stats-dock-scroll">
        <DeckStatsPanel cards={cards} leaderId={leaderId} hints={sheetHints} />
      </div>
    </Dialog>
  ) : null;
}

/**
 * Read-only public share page: no header action row there, so it keeps the floating Stats pill.
 * The deck page uses StatsButton in its header instead.
 */
export function SharedStatsDock({ cards, leaderId }: { cards: DeckStatsCard[]; leaderId: string | null }) {
  const mode = useStatsMode(false);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (mode !== "sheet") return;
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) < 8) return;
      setHidden(y > last && y > 160);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [mode]);
  useEffect(() => {
    if (mode !== "sheet") setOpen(false);
  }, [mode]);
  return (
    <>
      {mode === "sheet" ? (
        <button type="button" className={`stats-pill${hidden ? " stats-pill-hidden" : ""}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
          <StatsIcon />
          Stats
        </button>
      ) : null}
      <DeckStatsDock cards={cards} leaderId={leaderId} mode={mode} sheetOpen={open} onSheetOpenChange={setOpen} />
    </>
  );
}
