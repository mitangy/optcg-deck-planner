import { useCallback, useState, type ReactNode } from "react";
import { CardInspect } from "./board/preview/CardInspect";

/** Log Pose card art opens the duel app's own card preview (z-inspect, above the Log Pose panel) (#1459). */
export function useLogPoseCardInspect(): { openCard: (id: string) => void; inspect: ReactNode } {
  const [defId, setDefId] = useState<string | null>(null);
  const openCard = useCallback((id: string) => setDefId(id), []);
  const inspect = defId ? <CardInspect defId={defId} open onClose={() => setDefId(null)} /> : null;
  return { openCard, inspect };
}
