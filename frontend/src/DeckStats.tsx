import { useEffect, useMemo, useRef, useState } from "react";
import { DeckHintsTray, type HintsState } from "./DeckHints";
import { useStatsAtlas } from "./useStatsAtlas";
import { DrawOdds, SearcherOdds } from "./DrawOdds";
import { deckEntries, type DeckEntry } from "./drawOdds";
import {
  computeDeckStats,
  type DeckStats,
  type DeckStatsCard,
  type NameCount,
} from "./deckStats";

const COLOR_DOT: Record<string, string> = {
  red: "#c4423a",
  green: "#3f8f4f",
  blue: "#2f7fc0",
  purple: "#7b4fb0",
  black: "#1c1c22",
  yellow: "#e0b82e",
};

const fmt = (n: number, digits = 0) =>
  n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="ds-tile">
      <span className="ds-tile-label">{label}</span>
      <strong className="ds-tile-value">{value}</strong>
      {sub ? <span className="ds-tile-sub">{sub}</span> : null}
    </div>
  );
}

function Chips({ rows, colorDots }: { rows: NameCount[]; colorDots?: boolean }) {
  if (rows.length === 0) return <p className="muted ds-empty">None</p>;
  return (
    <ul className="ds-chips">
      {rows.map((r) => (
        <li key={r.name} className="ds-chip">
          {colorDots ? (
            <span className="ds-dot" style={{ background: COLOR_DOT[r.name] ?? "var(--muted)" }} aria-hidden="true" />
          ) : null}
          <span className="ds-chip-name">{r.name}</span>
          <span className="ds-chip-count">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}

function HBars({ rows }: { rows: NameCount[] }) {
  if (rows.length === 0) return <p className="muted ds-empty">None</p>;
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <ul className="ds-hbars">
      {rows.map((r) => (
        <li key={r.name}>
          <span className="ds-hbar-name" title={r.name}>
            {r.name}
          </span>
          <span className="ds-hbar-track">
            <span style={{ width: `${(r.count / max) * 100}%` }} />
          </span>
          <span className="ds-hbar-count">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}

function CostCurve({ stats }: { stats: DeckStats }) {
  const max = Math.max(1, ...stats.costCurve.map((b) => b.total));
  return (
    <div className="ds-block">
      <h3>Cost curve</h3>
      <div className="ds-legend" aria-hidden="true">
        <span><i className="ds-key ds-char" />Character</span>
        <span><i className="ds-key ds-event" />Event</span>
        <span><i className="ds-key ds-stage" />Stage</span>
      </div>
      <div className="ds-columns ds-cost" role="img" aria-label={`Cost curve: ${stats.costCurve.map((b) => `cost ${b.cost}${b.cost === 10 ? "+" : ""}: ${b.total}`).join(", ")}`}>
        {stats.costCurve.map((b) => (
          <div key={b.cost} className="ds-col">
            <span className="ds-col-count">{b.total || ""}</span>
            <div className="ds-col-bar">
              <div className="ds-stack" style={{ height: `${(b.total / max) * 100}%` }}>
                {(["stage", "event", "character"] as const).map((t) =>
                  b[t] > 0 ? (
                    <span key={t} className={`ds-seg ds-${t === "character" ? "char" : t}`} style={{ flexGrow: b[t] }} title={`${b[t]} ${t}`} />
                  ) : null,
                )}
              </div>
            </div>
            <span className="ds-col-label">{b.cost === 10 ? "10+" : b.cost}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PowerCurve({ stats }: { stats: DeckStats }) {
  if (stats.powerCurve.length === 0) return null;
  const max = Math.max(1, ...stats.powerCurve.map((p) => p.count));
  return (
    <div className="ds-block">
      <h3>Character power</h3>
      <div className="ds-columns ds-power" role="img" aria-label={`Character power: ${stats.powerCurve.filter((p) => p.count).map((p) => `${p.power / 1000}k: ${p.count}`).join(", ")}`}>
        {stats.powerCurve.map((p) => (
          <div key={p.power} className="ds-col">
            <span className="ds-col-count">{p.count || ""}</span>
            <div className="ds-col-bar">
              <div className="ds-stack" style={{ height: `${(p.count / max) * 100}%` }}>
                {p.count > 0 ? <span className="ds-seg ds-char" style={{ flexGrow: 1 }} /> : null}
              </div>
            </div>
            <span className="ds-col-label">{p.power / 1000}k</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CounterBlock({ stats }: { stats: DeckStats }) {
  const c = stats.counter;
  const parts = [
    { key: "none", label: "No counter", n: c.none },
    { key: "c1000", label: "+1000", n: c.c1000 },
    { key: "c2000", label: "+2000", n: c.c2000 },
    { key: "other", label: "Other", n: c.other },
  ].filter((p) => p.n > 0);
  return (
    <div className="ds-block">
      <h3>Counters</h3>
      <div className="ds-split" role="img" aria-label={parts.map((p) => `${p.label}: ${p.n}`).join(", ")}>
        {parts.map((p) => (
          <span key={p.key} className={`ds-split-seg ds-${p.key}`} style={{ flexGrow: p.n }} title={`${p.label}: ${p.n}`} />
        ))}
      </div>
      <ul className="ds-split-legend">
        {parts.map((p) => (
          <li key={p.key}>
            <i className={`ds-key ds-${p.key}`} />
            {p.label} <strong>{p.n}</strong>
          </li>
        ))}
        <li>
          Counter events <strong>{c.events}</strong>
        </li>
      </ul>
      <p className="ds-note">
        Opening hand of {stats.openingHand.size}: about <strong>{fmt(stats.openingHand.expectedCounter)}</strong> counter and{" "}
        <strong>{fmt(stats.openingHand.expectedTriggers, 1)}</strong> Trigger cards.
      </p>
    </div>
  );
}

function StatsBody({ stats, entries }: { stats: DeckStats; entries: DeckEntry[] }) {
  const blockers = stats.keywords.find((k) => k.name === "Blocker")?.count ?? 0;
  return (
    <div className="ds-body">
      <div className="ds-tiles">
        <Tile label="Cards" value={String(stats.total)} sub={`${stats.byType.character} Char · ${stats.byType.event} Event · ${stats.byType.stage} Stage`} />
        <Tile label="Avg counter" value={fmt(stats.counter.average)} sub="per card" />
        <Tile label="Triggers" value={String(stats.triggers)} />
        <Tile label="Blockers" value={String(blockers)} />
      </div>
      <div className="ds-grid">
        <CostCurve stats={stats} />
        <CounterBlock stats={stats} />
        <PowerCurve stats={stats} />
        <div className="ds-block">
          <h3>Keywords</h3>
          <Chips rows={stats.keywords} />
          <h3 className="ds-sub">Timing</h3>
          <Chips rows={stats.timing} />
        </div>
        <div className="ds-block">
          <h3>Top traits</h3>
          <HBars rows={stats.traits} />
        </div>
        <div className="ds-block">
          <h3>Roles</h3>
          <Chips rows={stats.roles} />
          <h3 className="ds-sub">Colors</h3>
          <Chips rows={stats.colors} colorDots />
          <h3 className="ds-sub">Attributes</h3>
          <Chips rows={stats.attributes} />
        </div>
        <DrawOdds entries={entries} />
        <SearcherOdds entries={entries} />
      </div>
      {stats.unknown > 0 ? (
        <p className="muted ds-empty">{stats.unknown} card{stats.unknown === 1 ? "" : "s"} missing from the stats data are not counted.</p>
      ) : null}
    </div>
  );
}

function StatsLoader({ cards, leaderId }: { cards: DeckStatsCard[]; leaderId: string | null }) {
  const q = useStatsAtlas();
  const stats = useMemo(() => (q.data ? computeDeckStats(cards, q.data, leaderId) : null), [cards, q.data, leaderId]);
  const entries = useMemo(() => (q.data ? deckEntries(cards, q.data) : []), [cards, q.data]);
  if (stats) return <StatsBody stats={stats} entries={entries} />;
  return (
    <div className="ds-placeholder" aria-busy={q.isLoading}>
      {q.error ? (
        <>
          <p className="error">{(q.error as Error).message}</p>
          <button type="button" className="btn secondary" onClick={() => void q.refetch()}>
            Retry
          </button>
        </>
      ) : (
        <p className="muted">Loading stats…</p>
      )}
    </div>
  );
}

/** Wide enough for the page to sit beside a stats column (matches the CSS breakpoint). */
const DOCK_QUERY = "(min-width: 1100px)";
const COLLAPSED_KEY = "optcg_deck_stats_collapsed";

function useMediaQuery(query: string): boolean {
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

function StatsContent({ cards, leaderId, hints }: { cards: DeckStatsCard[]; leaderId: string | null; hints?: HintsState }) {
  return (
    <>
      {hints ? <DeckHintsTray hints={hints} /> : null}
      <StatsLoader cards={cards} leaderId={leaderId} />
    </>
  );
}

/**
 * Deck stats beside the deck list. Wide screens: a sticky right column that collapses to a slim
 * rail. Narrow screens: a floating "Stats" pill that opens a bottom sheet, so the list stays put.
 * `hints` (owner only) puts the build-hint tray at the top and its count on the rail / pill.
 */
export function DeckStatsDock({ cards, leaderId, hints }: { cards: DeckStatsCard[]; leaderId: string | null; hints?: HintsState }) {
  const wide = useMediaQuery(DOCK_QUERY);
  const [collapsed, setCollapsed] = useStatsCollapsed();
  const [sheetOpen, setSheetOpen] = useState(false);
  const pillRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const badge = hints && hints.visible.length > 0 ? hints.visible.length : 0;
  const badgeEl = badge ? (
    <span className="filter-drawer-badge" aria-label={`${badge} build hints`}>
      {badge}
    </span>
  ) : null;

  const sheetShown = sheetOpen && !wide;
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
          <button type="button" className="stats-rail" aria-expanded={false} aria-label={badge ? `Expand deck stats, ${badge} build hints` : "Expand deck stats"} onClick={() => setCollapsed(false)}>
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
            <button type="button" className="ghost stats-dock-collapse" aria-expanded aria-label="Collapse deck stats" onClick={() => setCollapsed(true)}>
              <Chevron dir="right" />
            </button>
          </div>
          <div className="stats-dock-scroll">
            <StatsContent cards={cards} leaderId={leaderId} hints={hints} />
          </div>
        </div>
      </aside>
    );
  }

  return (
    <>
      <button ref={pillRef} type="button" className="stats-pill" aria-haspopup="dialog" aria-expanded={sheetShown} onClick={() => setSheetOpen(true)}>
        <StatsIcon />
        Stats
        {badgeEl}
      </button>
      {sheetShown ? (
        <div className="stats-sheet-backdrop" onClick={() => setSheetOpen(false)}>
          <div className="stats-sheet deck-stats" role="dialog" aria-modal="true" aria-label="Deck stats" onClick={(e) => e.stopPropagation()}>
            <div className="stats-dock-head">
              <h2>Deck stats</h2>
              <button ref={closeRef} type="button" className="ghost stats-dock-collapse" onClick={() => setSheetOpen(false)}>
                Close
              </button>
            </div>
            <div className="stats-dock-scroll">
              <StatsContent cards={cards} leaderId={leaderId} hints={hints} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
