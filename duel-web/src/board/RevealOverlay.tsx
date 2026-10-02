import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { lookupCard } from "../cards/atlas";
import { resolveCardImageUrl } from "../decks/artPrefs";
import type { BattleLogEntry } from "./battleLog";
import { newOpponentReveals, type OpponentReveal } from "./revealCues";

const SHOW_MS = 3600;

/**
 * Queue of cards the opponent reveals, filled as new log entries arrive (never
 * on mount, resync or undo; see newOpponentReveals). `enabled` = reveals apply
 * (not spectating); the log is tracked either way so enabling never replays.
 */
export function useOpponentReveals(
  battleLog: readonly BattleLogEntry[],
  oppSeat: 0 | 1,
  enabled: boolean,
) {
  const [queue, setQueue] = useState<OpponentReveal[]>([]);
  const prevLast = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const prev = prevLast.current;
    prevLast.current = battleLog.length ? battleLog[battleLog.length - 1]!.id : null;
    if (!enabled) return;
    const fresh = newOpponentReveals(prev, battleLog, oppSeat);
    if (fresh.length) setQueue((q) => [...q, ...fresh]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleLog]);
  const dismiss = useCallback(() => setQueue((q) => q.slice(1)), []);
  return { current: queue[0] ?? null, waiting: Math.max(0, queue.length - 1), dismiss };
}

/**
 * The revealed card, big over the board with "Opponent reveals …". Fixed
 * overlay: the backdrop lets clicks through, only the card itself takes a
 * click (or Esc) to dismiss; it also leaves on its own after a few seconds.
 */
export function RevealOverlay({
  reveal,
  waiting,
  oppSeat,
  onDismiss,
}: {
  reveal: OpponentReveal | null;
  waiting: number;
  oppSeat: 0 | 1;
  onDismiss: () => void;
}) {
  const entry = useMemo(() => (reveal ? lookupCard(reveal.defId) : null), [reveal]);
  const src = useMemo(
    () => (reveal ? resolveCardImageUrl(reveal.defId, { ownerSeat: oppSeat, size: "large" }) : null),
    [reveal, oppSeat],
  );
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (!reveal) return;
    const t = window.setTimeout(onDismiss, SHOW_MS);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDismiss();
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [reveal, onDismiss]);
  if (!reveal || !entry) return null;
  return createPortal(
    <div className="reveal-overlay" role="status" aria-live="polite">
      <button
        key={reveal.entryId}
        type="button"
        className="reveal-card"
        onClick={onDismiss}
        aria-label={`Opponent reveals ${entry.name}. Dismiss`}
      >
        {src && src !== failed ? (
          <img src={src} alt={entry.name} draggable={false} onError={() => setFailed(src)} />
        ) : (
          <div className="reveal-fallback">{entry.id}</div>
        )}
        <span className="reveal-caption">
          Opponent reveals <strong>{entry.name}</strong>
          {waiting ? <span className="reveal-more"> +{waiting} more</span> : null}
        </span>
      </button>
    </div>,
    document.body,
  );
}
