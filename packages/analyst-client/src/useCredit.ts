import { useCallback, useEffect, useMemo, useState } from "react";
import type { DonePayload } from "./client";
import { applyDone, fetchCredit, withRefusal, type Credit, type RefusalCode } from "./credit";

/** The player's credit, kept fresh: loaded when the panel is on, updated by each answer. */
export function useCredit(apiBase: string, on: boolean, account: string | number | null | undefined) {
  const [credit, setCredit] = useState<Credit | null>(null);
  const refresh = useCallback(() => {
    if (!on) return;
    void fetchCredit(apiBase).then((c) => c && setCredit(c));
  }, [apiBase, on]);
  useEffect(() => {
    if (on) refresh();
    else setCredit(null);
  }, [on, refresh, account]);
  const apply = useCallback((d: DonePayload) => setCredit((c) => applyDone(c, d)), []);
  const refuse = useCallback((code: RefusalCode) => setCredit((c) => withRefusal(c, code)), []);
  return useMemo(() => ({ credit, refresh, apply, refuse }), [credit, refresh, apply, refuse]);
}
