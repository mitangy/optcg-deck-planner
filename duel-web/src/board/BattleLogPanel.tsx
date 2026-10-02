import { useEffect, useRef, useState } from "react";
import type { Seat } from "../decks/seatArtPrefs";
import type { BattleLogEntry, LogSegment, LogTone } from "./battleLog";
import { groupBattleLogByTurn } from "./battleLog";
import { CardInspect } from "./CardInspect";
import { inspectOnContextMenu } from "./inspectGestures";
import { setPreviewCard } from "./cardPreview";

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
        if (e.pointerType === "mouse") setPreviewCard({ defId: seg.defId, ownerSeat: seg.ownerSeat });
      }}
      onFocus={() => setPreviewCard({ defId: seg.defId, ownerSeat: seg.ownerSeat })}
      onClick={() => onInspect(seg)}
      onContextMenu={(e) => inspectOnContextMenu(e, () => onInspect(seg))}
    >
      {seg.name}
    </button>
  );
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
  const groups = groupBattleLogByTurn(entries);
  const [inspect, setInspect] = useState<{ defId: string; ownerSeat?: Seat } | null>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || collapsed) return;
    el.scrollTop = el.scrollHeight;
  }, [entries, collapsed]);

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
        <div className="battle-log-body" ref={scrollerRef}>
          {groups.length === 0 ? (
            <p className="battle-log-empty">Actions will appear here as the match plays.</p>
          ) : (
            groups.map((g) => (
              <section key={g.turn} className="battle-log-turn">
                <h3 className="battle-log-turn-title">Turn {g.turn}</h3>
                <ul className="battle-log-lines">
                  {g.lines.map((line) => {
                    const tone = line.tone ?? "routine";
                    const icon = TONE_ICON[tone];
                    return (
                      <li
                        key={line.id}
                        className={`log-line log-${tone}${line.important ? " log-important" : ""}`}
                      >
                        <span className="log-icon" aria-hidden>
                          {icon ?? ""}
                        </span>
                        <span className="log-text">
                          {(line.segments ?? [{ kind: "text" as const, text: line.text }]).map((seg, i) =>
                            seg.kind === "card" ? (
                              <CardName
                                key={i}
                                seg={seg}
                                onInspect={(s) => setInspect({ defId: s.defId, ownerSeat: s.ownerSeat })}
                              />
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
