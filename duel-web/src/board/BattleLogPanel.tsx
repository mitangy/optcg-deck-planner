import { useEffect, useRef } from "react";
import type { BattleLogEntry } from "./battleLog";
import { groupBattleLogByTurn } from "./battleLog";

type Props = {
  entries: readonly BattleLogEntry[];
  collapsed?: boolean;
  onToggle?: () => void;
};

export function BattleLogPanel({ entries, collapsed, onToggle }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const groups = groupBattleLogByTurn(entries);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || collapsed) return;
    el.scrollTop = el.scrollHeight;
  }, [entries, collapsed]);

  return (
    <aside className={`battle-log${collapsed ? " collapsed" : ""}`}>
      <button
        type="button"
        className="battle-log-toggle"
        onClick={onToggle}
        aria-expanded={!collapsed}
      >
        <span>Battle log</span>
        <span className="battle-log-count">{entries.length}</span>
      </button>
      {!collapsed ? (
        <div className="battle-log-body" ref={scrollerRef}>
          {groups.length === 0 ? (
            <p className="battle-log-empty">Actions will appear here as the match plays.</p>
          ) : (
            groups.map((g) => (
              <section key={g.turn} className="battle-log-turn">
                <h3 className="battle-log-turn-title">Turn {g.turn}</h3>
                <ul className="battle-log-lines">
                  {g.lines.map((line) => (
                    <li key={line.id}>{line.text}</li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      ) : null}
    </aside>
  );
}
