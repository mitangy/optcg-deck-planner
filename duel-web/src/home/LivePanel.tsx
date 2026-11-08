import { useEffect, useRef, useState } from "react";
import { usePolling } from "../lib/usePolling";
import { fetchLive, type LiveCounts } from "../net/api";
import { liveSummary } from "./live";

export const LIVE_REFRESH_MS = 60_000;

/** Fetches /duel/live on mount and every minute while the tab is visible (and when it becomes visible again). */
export function useLiveCounts(): LiveCounts | null {
  const [counts, setCounts] = useState<LiveCounts | null>(null);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  // A hidden tab neither fetches on mount nor on the timer.
  usePolling(() => {
    if (document.visibilityState !== "visible") return;
    fetchLive()
      .then((c) => live.current && setCounts(c))
      .catch(() => undefined);
  }, LIVE_REFRESH_MS);
  return counts;
}

type LivePanelProps = {
  onInvite: () => void;
  onBot: () => void;
  onPractice: () => void;
  disabled?: boolean;
};

/** A live pill when matches are on; when none are, a card that sends players to a friend, a bot or Practice. */
export function LivePanel({ onInvite, onBot, onPractice, disabled }: LivePanelProps) {
  const summary = liveSummary(useLiveCounts());
  if (!summary) return null;
  if (!summary.empty) {
    return (
      <p className="live-pill" role="status">
        <span className="live-dot" aria-hidden />
        {summary.text}
      </p>
    );
  }
  return (
    <section className="live-empty" aria-label="No matches right now">
      <h2 className="live-empty-title">No matches being played right now</h2>
      <p className="live-empty-copy">Start one: invite a friend, or warm up against a bot.</p>
      <button type="button" className="btn btn-primary live-empty-invite" disabled={disabled} onClick={onInvite}>
        Invite a friend
      </button>
      <div className="live-empty-alt">
        <button type="button" className="btn live-empty-small" disabled={disabled} onClick={onBot}>
          Play vs Bot
        </button>
        <button type="button" className="btn live-empty-small" disabled={disabled} onClick={onPractice}>
          Practice
        </button>
      </div>
    </section>
  );
}
