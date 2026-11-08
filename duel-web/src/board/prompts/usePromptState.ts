import { useEffect, useState } from "react";
import type { Intent, PlayerView } from "../../net/protocol";
import { playNeedsReplace } from "../combat/dragIntents";

/**
 * The board's pop-up prompt state: which pending choice the player tucked away to look at the board, and the
 * "which Character do you replace?" question for a play on a full board.
 */
export function usePromptState({
  view,
  intents,
  clearSelection,
}: {
  view: PlayerView | null;
  intents: Intent[];
  /** Asking to replace drops the hand / board selection. */
  clearSelection: () => void;
}) {
  /** Id of the choice whose pop-up the player tucked away to look at the hand/board. */
  const [hiddenChoiceId, setHiddenChoiceId] = useState<string | null>(null);
  /** Hand card (instance id) waiting on "which Character do you replace?". */
  const [replaceCardId, setReplaceCardId] = useState<string | null>(null);
  // Track the card, not its hand slot: indexes shift as the hand changes.
  const replaceHandIndex = replaceCardId
    ? (view?.you.hand.findIndex((c) => c.id === replaceCardId) ?? -1)
    : -1;
  const replaceOpen = replaceHandIndex >= 0 && playNeedsReplace(intents, replaceHandIndex);
  useEffect(() => {
    // Drop the prompt once the play stops being legal (turn passed, card left hand…).
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
