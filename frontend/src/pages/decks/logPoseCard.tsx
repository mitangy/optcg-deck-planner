import { useCallback, useState, type ReactNode } from "react";
import { CardLightbox } from "../../ui/CardThumb";

/** Log Pose card art opens the planner's own enlarged card (z-modal, above the Log Pose panel) (#1459). */
export function useLogPoseCardLightbox(): { openCard: (id: string) => void; lightbox: ReactNode } {
  const [cardId, setCardId] = useState<string | null>(null);
  const openCard = useCallback((id: string) => setCardId(id), []);
  const lightbox = cardId ? <CardLightbox cardId={cardId} alt={cardId} onClose={() => setCardId(null)} /> : null;
  return { openCard, lightbox };
}
