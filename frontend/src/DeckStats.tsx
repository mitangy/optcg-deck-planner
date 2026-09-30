import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { CollapsibleDrawer } from "./cardListControls";
import {
  computeDeckStats,
  type DeckStats,
  type DeckStatsCard,
  type NameCount,
  type StatsAtlas,
} from "./deckStats";

export type StatsPlacement = "beside" | "below";

const PLACEMENT_KEY = "optcg_deck_stats_placement";

export function useStatsPlacement() {
  const [placement, setPlacement] = useState<StatsPlacement>(() => {
    try {
      return localStorage.getItem(PLACEMENT_KEY) === "below" ? "below" : "beside";
    } catch {
      return "beside";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(PLACEMENT_KEY, placement);
    } catch {
      /* ignore */
    }
  }, [placement]);
  return [placement, setPlacement] as const;
}

// Fetched on first use only, then shared by every panel on the page.
let atlasPromise: Promise<StatsAtlas> | null = null;
function loadStatsAtlas(): Promise<StatsAtlas> {
  atlasPromise ??= fetch("/deckStats.json")
    .then((res) => {
      if (!res.ok) throw new Error(`Card stats unavailable (${res.status})`);
      return res.json() as Promise<StatsAtlas>;
    })
    .catch((err: unknown) => {
      atlasPromise = null;
      throw err instanceof Error ? err : new Error("Card stats unavailable");
    });
  return atlasPromise;
}

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

function StatsBody({ stats }: { stats: DeckStats }) {
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
      </div>
      {stats.unknown > 0 ? (
        <p className="muted ds-empty">{stats.unknown} card{stats.unknown === 1 ? "" : "s"} missing from the stats data are not counted.</p>
      ) : null}
    </div>
  );
}

function StatsLoader({ cards, leaderId }: { cards: DeckStatsCard[]; leaderId: string | null }) {
  const q = useQuery({ queryKey: ["deck-stats-atlas"], queryFn: loadStatsAtlas, staleTime: Infinity, retry: 1 });
  const stats = useMemo(() => (q.data ? computeDeckStats(cards, q.data, leaderId) : null), [cards, q.data, leaderId]);
  if (stats) return <StatsBody stats={stats} />;
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

export function DeckStatsPanel({
  cards,
  leaderId,
  storageKey,
  defaultOpen,
  placement,
  onPlacementChange,
}: {
  cards: DeckStatsCard[];
  leaderId: string | null;
  storageKey: string;
  defaultOpen: boolean;
  /** Omit on read-only pages (public share) to hide the placement setting. */
  placement?: StatsPlacement;
  onPlacementChange?: (next: StatsPlacement) => void;
}) {
  return (
    <div className="deck-stats">
      <CollapsibleDrawer label="Deck stats" storageKey={storageKey} defaultOpen={defaultOpen}>
        {placement && onPlacementChange ? (
          <div className="ds-placement">
            <span className="muted">Show</span>
            <div className="layout-toggle" role="group" aria-label="Stats placement">
              <button type="button" className={placement === "beside" ? "active" : ""} aria-pressed={placement === "beside"} onClick={() => onPlacementChange("beside")}>
                Beside editor
              </button>
              <button type="button" className={placement === "below" ? "active" : ""} aria-pressed={placement === "below"} onClick={() => onPlacementChange("below")}>
                Below list
              </button>
            </div>
          </div>
        ) : null}
        <StatsLoader cards={cards} leaderId={leaderId} />
      </CollapsibleDrawer>
    </div>
  );
}
