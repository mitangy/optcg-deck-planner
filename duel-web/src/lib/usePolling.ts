import { useEffect, useRef } from "react";

/**
 * Runs `load` now, then every `ms` while the tab is visible, and once more whenever the tab becomes visible
 * again. `ms: null` skips the timer (now, and on coming back, only). Returns a stop function.
 */
export function startPolling(load: () => unknown, ms: number | null): () => void {
  void load();
  const id =
    ms === null
      ? undefined
      : window.setInterval(() => {
          if (document.visibilityState === "visible") void load();
        }, ms);
  const onVisible = () => {
    if (document.visibilityState === "visible") void load();
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    if (id !== undefined) window.clearInterval(id);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

/**
 * Calls `load` now and every `ms` while the tab is visible (see `startPolling`). The latest `load` is always the
 * one that runs, so it may close over fresh state. `enabled: false` stops it; `restartKey` restarts it (a new
 * immediate call) when it changes.
 */
export function usePolling(load: () => unknown, ms: number | null, enabled = true, restartKey?: unknown) {
  const ref = useRef(load);
  ref.current = load;
  useEffect(() => {
    if (!enabled) return;
    return startPolling(() => ref.current(), ms);
  }, [enabled, ms, restartKey]);
}
