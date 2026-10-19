import { useEffect, useState } from "react";
import { fetchLive, type LiveCounts } from "../net/api";
import { liveLine } from "./live";

export const LIVE_REFRESH_MS = 60_000;

/** Fetches /duel/live on mount and every minute while the tab is visible (and when it becomes visible again). */
function useLiveCounts(): LiveCounts | null {
  const [counts, setCounts] = useState<LiveCounts | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      fetchLive()
        .then((c) => live && setCounts(c))
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, LIVE_REFRESH_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      live = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);
  return counts;
}

/** A quiet line under the side cards; nothing at all when the counts are missing or small. */
export function LiveLine() {
  const line = liveLine(useLiveCounts());
  return line ? (
    <p className="home-live" role="status">
      {line}
    </p>
  ) : null;
}
