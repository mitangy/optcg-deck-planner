import { useEffect, useState } from "react";
import type { Intent, PlayerView } from "../../net/protocol";
import { playNeedsReplace } from "../combat/dragIntents";

export function usePromptState({
  view,
  intents,
  clearSelection,
}: {
  view: PlayerView | null;
  intents: Intent[];
  clearSelection: () => void;
}) {
  const [hiddenChoiceId, setHiddenChoiceId] = useState<string | null>(null);
  const [replaceCardId, setReplaceCardId] = useState<string | null>(null);
  const replaceHandIndex = replaceCardId
    ? (view?.you.hand.findIndex((c) => c.id === replaceCardId) ?? -1)
    : -1;
  const replaceOpen = replaceHandIndex >= 0 && playNeedsReplace(intents, replaceHandIndex);
  useEffect(() => {
    if (replaceCardId && !replaceOpen) setReplaceCardId(null);
  }, [replaceCardId, replaceOpen]);

  function openReplace(handIndex: number) {
    const card = view?.you.hand[handIndex];
    if (!card) return;
    clearSelection();
    setReplaceCardId(card.id);
  }

  return { hiddenChoiceId, setHiddenChoiceId, replaceCardId, setReplaceCardId, replaceHandIndex, replaceOpen, openReplace };
}
