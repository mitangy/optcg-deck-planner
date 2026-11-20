import { useEffect, useRef, useState } from "react";
import { usePolling } from "../lib/usePolling";
import { fetchLive, type LiveCounts } from "../net/api";
import { liveSummary } from "./live";

export const LIVE_REFRESH_MS = 60_000;

export function useLiveCounts(): LiveCounts | null {
  const [counts, setCounts] = useState<LiveCounts | null>(null);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  usePolling(() => {
    if (document.visibilityState !== "visible") return;
    fetchLive()
      .then((c) => live.current && setCounts(c))
      .catch(() => undefined);
  }, LIVE_REFRESH_MS);
  return counts;
}

type LivePanelProps = {
  counts: LiveCounts | null;
  onInvite: () => void;
  disabled?: boolean;
};

export function LivePanel({ counts, onInvite, disabled }: LivePanelProps) {
  const summary = liveSummary(counts);
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
    <p className="live-pill" role="status">
      <span className="live-dot live-dot-idle" aria-hidden />
      <span>
        No live matches right now ·{" "}
        <button type="button" className="live-invite-link" disabled={disabled} onClick={onInvite}>
          Invite a friend
        </button>
      </span>
    </p>
  );
}
