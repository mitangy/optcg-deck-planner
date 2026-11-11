import { useEffect, useRef, useState } from "react";
import { lookupCard } from "../../cards/atlas";
import { CardArt } from "../../cards/CardArt";
import { resolveCardImageUrl } from "../../decks/artPrefs";
import type { Seat } from "../../decks/seatArtPrefs";
import type { BattleLogEntry, LogSegment, LogTone } from "../match/battleLog";
import { glueSegments, groupBattleLogByTurn } from "../match/battleLog";
import { CardInspect } from "../preview/CardInspect";
import { inspectOnContextMenu } from "../preview/inspectGestures";
import { endPreviewHover, hoverPreviewCard, setPreviewCard } from "../preview/cardPreview";
import { cardUseOf, type CardUse } from "../motion/opponentPlay";
import {
  filterBattleLog,
  loadBattleLogFilter,
  saveBattleLogFilter,
  type BattleLogFilter,
} from "./battleLogFilter";

type Props = {
  entries: readonly BattleLogEntry[];
  collapsed?: boolean;
  onToggle?: () => void;
  /** Wide layouts: fixed open panel with a plain heading (no toggle). */
  alwaysOpen?: boolean;
  /** Seat controlling the UI (art picks in the inspect sheet). */
  viewingSeat?: Seat;
};

/**
 * Text-presentation glyphs (U+FE0E keeps ⚔/✖ from rendering as emoji) so the
 * icon column stays a fixed width on every platform.
 */
export const TONE_ICON: Partial<Record<LogTone, string>> = {
  play: "▸",
  attack: "⚔︎",
  block: "◆",
  counter: "⛨︎",
  hit: "✓︎",
  miss: "·",
  ko: "✖︎",
  damage: "♥︎",
  search: "＋",
  trash: "↓",
  effect: "✦",
  trigger: "⚡︎",
  reveal: "◉",
  win: "★",
};

function CardName({
  seg,
  onInspect,
}: {
  seg: Extract<LogSegment, { kind: "card" }>;
  onInspect: (seg: Extract<LogSegment, { kind: "card" }>) => void;
}) {
  return (
    <button
      type="button"
      className="log-card"
      title={`${seg.name} — click to inspect`}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") hoverPreviewCard({ defId: seg.defId, ownerSeat: seg.ownerSeat }, e.currentTarget);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") endPreviewHover();
      }}
      onFocus={() => setPreviewCard({ defId: seg.defId, ownerSeat: seg.ownerSeat })}
      onClick={() => onInspect(seg)}
      onContextMenu={(e) => inspectOnContextMenu(e, () => onInspect(seg))}
    >
      {seg.name}
    </button>
  );
}

/** A card-use line's small picture: hover previews, click or right-click inspects (same as the name). */
function LogThumb({
  use,
  label,
  onInspect,
}: {
  use: CardUse;
  label: string;
  onInspect: () => void;
}) {
  const src = resolveCardImageUrl(use.defId, { ownerSeat: use.ownerSeat });
  return (
    <button
      type="button"
      className="log-thumb"
      aria-label={label}
      title={label}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") hoverPreviewCard({ defId: use.defId, ownerSeat: use.ownerSeat }, e.currentTarget);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") endPreviewHover();
      }}
      onFocus={() => setPreviewCard({ defId: use.defId, ownerSeat: use.ownerSeat })}
      onClick={onInspect}
      onContextMenu={(e) => inspectOnContextMenu(e, onInspect)}
    >
      <CardArt src={src} defId={use.defId} fallback={use.defId} draggable={false} />
    </button>
  );
}

const FILTERS: { id: BattleLogFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "plays", label: "Plays" },
];

/** Accessible label, e.g. "Opponent played Nami, turn 5" (no who when spectating). */
export function thumbLabel(use: CardUse, turn: number, viewingSeat?: Seat): string {
  const name = lookupCard(use.defId).name;
  const who = viewingSeat == null ? "" : use.ownerSeat === viewingSeat ? "You " : "Opponent ";
  const text = `${who}${use.verb} ${name}, turn ${turn}`;
  return who ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

export function BattleLogPanel({
  entries,
  collapsed: collapsedProp,
  onToggle,
  alwaysOpen = false,
  viewingSeat,
}: Props) {
  const collapsed = alwaysOpen ? false : collapsedProp;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<BattleLogFilter>(loadBattleLogFilter);
  const groups = groupBattleLogByTurn(filterBattleLog(entries, filter));
  const [inspect, setInspect] = useState<{ defId: string; ownerSeat?: Seat } | null>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || collapsed) return;
    el.scrollTop = el.scrollHeight;
  }, [entries, collapsed, filter]);

  return (
    <aside
      className={`battle-log${collapsed ? " collapsed" : ""}${alwaysOpen ? " battle-log-fixed" : ""}`}
    >
      {alwaysOpen ? (
        <h2 className="battle-log-toggle battle-log-heading">
          <span>Battle log</span>
          <span className="battle-log-count">{entries.length}</span>
        </h2>
      ) : (
        <button
          type="button"
          className="battle-log-toggle"
          onClick={onToggle}
          aria-expanded={!collapsed}
        >
          <span>Battle log</span>
          <span className="battle-log-count">{entries.length}</span>
        </button>
      )}
      {!collapsed ? (
        <div className="battle-log-filter" role="group" aria-label="Battle log filter">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className="battle-log-filter-btn"
              aria-pressed={filter === f.id}
              onClick={() => {
                setFilter(f.id);
                saveBattleLogFilter(f.id);
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      ) : null}
      {!collapsed ? (
        <div className="battle-log-body" ref={scrollerRef}>
          {groups.length === 0 ? (
            <p className="battle-log-empty">
              {filter === "plays" && entries.length > 0
                ? "No cards played yet."
                : "Actions will appear here as the match plays."}
            </p>
          ) : (
            groups.map((g) => (
              <section key={g.turn} className="battle-log-turn">
                <h3 className="battle-log-turn-title">Turn {g.turn}</h3>
                <ul className="battle-log-lines">
                  {g.lines.map((line) => {
                    const tone = line.tone ?? "routine";
                    const icon = TONE_ICON[tone];
                    const use = cardUseOf(line);
                    return (
                      <li
                        key={line.id}
                        className={`log-line log-${tone}${line.important ? " log-important" : ""}${use ? " log-line-use" : ""}`}
                      >
                        <span className="log-icon" aria-hidden>
                          {icon ?? ""}
                        </span>
                        {use ? (
                          <LogThumb
                            use={use}
                            label={thumbLabel(use, line.turn, viewingSeat)}
                            onInspect={() => setInspect({ defId: use.defId, ownerSeat: use.ownerSeat })}
                          />
                        ) : null}
                        <span className="log-text">
                          {glueSegments(line.segments ?? [{ kind: "text" as const, text: line.text }]).map(
                            ({ seg, glued }, i) =>
                              seg.kind === "card" ? (
                                <span key={i} className="log-glued">
                                  <CardName
                                    seg={seg}
                                    onInspect={(s) => setInspect({ defId: s.defId, ownerSeat: s.ownerSeat })}
                                  />
                                  {glued}
                                </span>
                              ) : (
                                <span key={i}>{seg.text}</span>
                              ),
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>
      ) : null}
      {inspect ? (
        <CardInspect
          defId={inspect.defId}
          open
          onClose={() => setInspect(null)}
          ownerSeat={inspect.ownerSeat}
          viewingSeat={viewingSeat}
        />
      ) : null}
    </aside>
  );
}
