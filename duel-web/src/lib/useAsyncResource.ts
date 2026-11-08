import { useCallback, useEffect, useMemo, useRef, useState, type DependencyList } from "react";

export type AsyncResourceState<T> =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "ready"; data: T };

export type AsyncResource<T> = AsyncResourceState<T> & {
  /** Fetches again: back to `loading`, then `ready` or `error` (a "Try again" button). */
  reload: () => void;
};

/**
 * Loads on mount and whenever `deps` change (or `reload()` is called): `loading`, then `ready` with the data or
 * `error` with whatever was thrown. A result that lands after a newer load started, or after unmount, is dropped.
 * The latest `load` is the one that runs, so it may close over fresh props. `enabled: false` waits (the state stays
 * as it was) until it turns true. Callers that keep the old data on screen while a refresh runs (stale-while-
 * revalidate, polling) or that merge into the data afterwards need their own state instead.
 */
export function useAsyncResource<T>(load: () => Promise<T>, deps: DependencyList, enabled = true): AsyncResource<T> {
  const [state, setState] = useState<AsyncResourceState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const ref = useRef(load);
  ref.current = load;
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    // Already loading on the first run: keep the same object so mounting does not render twice.
    setState((s) => (s.status === "loading" ? s : { status: "loading" }));
    ref.current().then(
      (data) => live && setState({ status: "ready", data }),
      (error: unknown) => live && setState({ status: "error", error }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt, enabled]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return useMemo(() => ({ ...state, reload }), [state, reload]);
}
