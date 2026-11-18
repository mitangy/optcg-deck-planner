import { useEffect, useRef } from "react";

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

export function usePolling(load: () => unknown, ms: number | null, enabled = true, restartKey?: unknown) {
  const ref = useRef(load);
  ref.current = load;
  useEffect(() => {
    if (!enabled) return;
    return startPolling(() => ref.current(), ms);
  }, [enabled, ms, restartKey]);
}
