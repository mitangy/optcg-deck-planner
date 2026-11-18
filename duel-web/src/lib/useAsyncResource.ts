import { useCallback, useEffect, useMemo, useRef, useState, type DependencyList } from "react";

export type AsyncResourceState<T> =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "ready"; data: T };

export type AsyncResource<T> = AsyncResourceState<T> & {
  reload: () => void;
};

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
