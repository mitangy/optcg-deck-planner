import { lazy, Suspense, useCallback, useState, type ReactNode } from "react";

const CardInspect = lazy(() => import("./board/preview/CardInspect").then((m) => ({ default: m.CardInspect })));

/** Log Pose card art opens the duel app's own card preview (z-inspect, above the Log Pose panel) (#1459). */
export function useLogPoseCardInspect(): { openCard: (id: string) => void; inspect: ReactNode } {
  const [defId, setDefId] = useState<string | null>(null);
  const openCard = useCallback((id: string) => setDefId(id), []);
  const inspect = defId ? (
    <Suspense fallback={null}>
      <CardInspect defId={defId} open onClose={() => setDefId(null)} />
    </Suspense>
  ) : null;
  return { openCard, inspect };
}
