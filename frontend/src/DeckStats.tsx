import { useEffect, useRef, useState } from "react";
import type { DeckStatsCard } from "@optcg/deck-analytics";
import { DeckStatsPanel, type HintsState } from "@optcg/deck-analytics/ui";

/** Wide enough for the page to sit beside a stats column (matches the CSS breakpoint). */
export const DOCK_QUERY = "(min-width: 1200px)";
const COLLAPSED_KEY = "optcg_deck_stats_collapsed";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false));
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}

function useStatsCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);
  return [collapsed, setCollapsed] as const;
}

function StatsIcon() {
  return (
    <svg className="stats-dock-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M2 14V8h3v6zM6.5 14V2h3v12zM11 14V5h3v9z" fill="currentColor" />
    </svg>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d={dir === "right" ? "M6 3l5 5-5 5" : "M10 3L5 8l5 5"} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Deck stats beside the deck list. Wide screens: a sticky right column that collapses to a slim
 * rail. Narrow screens: a floating "Stats" pill that opens a bottom sheet, so the list stays put.
 * `hints` (owner only) puts the build-hint tray at the top and its count on the rail / pill.
 */
export function DeckStatsDock({ cards, leaderId, hints, compact = false }: { cards: DeckStatsCard[]; leaderId: string | null; hints?: HintsState; compact?: boolean }) {
  // `compact` keeps the pill + sheet even on a wide screen (the editor is using the dock's column).
  const wide = useMediaQuery(DOCK_QUERY) && !compact;
  const [collapsed, setCollapsed] = useStatsCollapsed();
  const [sheetOpen, setSheetOpen] = useState(false);
  const pillRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const collapseRef = useRef<HTMLButtonElement>(null);
  const railRef = useRef<HTMLButtonElement>(null);
  const toggled = useRef(false);
  const [pillHidden, setPillHidden] = useState(false);
  const badge = hints && hints.visible.length > 0 ? hints.visible.length : 0;
  const badgeEl = badge ? (
    <span className="filter-drawer-badge" aria-label={`${badge} build hints`}>
      {badge}
    </span>
  ) : null;

  const sheetShown = sheetOpen && !wide;
  // Swapping the rail and the panel unmounts the focused button; hand focus to its counterpart.
  useEffect(() => {
    if (!toggled.current) return;
    toggled.current = false;
    (collapsed ? railRef.current : collapseRef.current)?.focus();
  }, [collapsed]);
  const toggle = (next: boolean) => {
    toggled.current = true;
    setCollapsed(next);
  };
  // The pill sits over the list: tuck it away while scrolling down, bring it back on scroll up.
  useEffect(() => {
    if (wide) return;
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) < 8) return;
      setPillHidden(y > last && y > 160);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [wide]);
  const trapTab = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const items = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])") ?? []);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  useEffect(() => {
    if (!sheetShown) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const pill = pillRef.current;
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      pill?.focus();
    };
  }, [sheetShown]);

  if (wide) {
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

  return (
    <>
      <button ref={pillRef} type="button" className={`stats-pill${pillHidden ? " stats-pill-hidden" : ""}`} aria-haspopup="dialog" aria-expanded={sheetShown} onClick={() => setSheetOpen(true)}>
        <StatsIcon />
        Stats
        {badgeEl}
      </button>
      {sheetShown ? (
        <div className="stats-sheet-backdrop" onClick={() => setSheetOpen(false)}>
          <div ref={sheetRef} className="stats-sheet deck-stats" role="dialog" aria-modal="true" aria-label="Deck stats" onKeyDown={trapTab} onClick={(e) => e.stopPropagation()}>
            <div className="stats-dock-head">
              <h2>Deck stats</h2>
              <button ref={closeRef} type="button" className="ghost stats-dock-collapse" onClick={() => setSheetOpen(false)}>
                Close
              </button>
            </div>
            <div className="stats-dock-scroll">
              <DeckStatsPanel cards={cards} leaderId={leaderId} hints={hints} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
