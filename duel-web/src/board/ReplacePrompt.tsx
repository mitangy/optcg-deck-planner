import { useMemo, useState } from "react";
import { lookupCard } from "../cards/atlas";
import type { ChoiceOptionView, Intent, PlayerView, Seat } from "../net/protocol";
import { BoardHighlight, useBoardTargetClicks } from "./ChoicePrompt";
import { useClickCopy } from "./clickCopy";
import { matchPlayCardTrash, playCardTrashTargetIds } from "./dragIntents";
import { FieldTargetBar } from "./FieldTargetBar";
import { resolvesOnPick, toggleSelection } from "./fieldTargets";
import { useDuelSettings } from "../settings";

type Props = {
  view: PlayerView;
  intents: Intent[];
  handIndex: number;
  mySeat: Seat;
  onSend: (intent: Intent) => void;
  onCancel: () => void;
};

/**
 * Playing a Character onto a full board: the player taps which of their
 * Characters to trash on the field itself (candidates outlined), or cancels
 * and keeps the card in hand. Nothing is sent until a Character is chosen;
 * with One-tap actions on, tapping one is the choice.
 */
export function ReplacePrompt({ view, intents, handIndex, mySeat, onSend, onCancel }: Props) {
  const oneTap = useDuelSettings().oneTapActions;
  const copy = useClickCopy();
  const [selected, setSelected] = useState<string | null>(null);
  const card = view.you.hand[handIndex];
  const targetIds = playCardTrashTargetIds(intents, handIndex);
  const name = card ? lookupCard(card.defId).name : "this card";
  const options = useMemo<ChoiceOptionView[]>(
    () =>
      view.you.characters
        .filter((c) => targetIds.includes(c.id))
        .map((c) => ({ id: c.id, defId: c.defId, instanceId: c.id, zone: "character", ownerSeat: mySeat, eligible: true })),
    // targetIds is rebuilt each render; its content is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view.you.characters, targetIds.join(","), mySeat],
  );
  const send = (id: string) => {
    const intent = matchPlayCardTrash(intents, handIndex, id);
    if (intent) onSend(intent);
  };
  useBoardTargetClicks(options, (id) => {
    if (resolvesOnPick(oneTap, 1, 1)) return send(id);
    setSelected((cur) => toggleSelection(cur ? [cur] : [], id, 1)[0] ?? null);
  });
  const intent = selected ? matchPlayCardTrash(intents, handIndex, selected) : null;
  return (
    <>
      <BoardHighlight ids={targetIds} kind="candidate" />
      <BoardHighlight ids={selected ? [selected] : []} kind="hover" />
      <FieldTargetBar
        title="Your board is full"
        text={copy(`Tap one of your Characters to trash so ${name} can take its place.`)}
        caption="Choose 1"
        label="Choose a Character to replace"
      >
        {resolvesOnPick(oneTap, 1, 1) ? null : (
          <button type="button" className="btn btn-primary" disabled={!intent} onClick={() => intent && onSend(intent)}>
            Trash &amp; play
          </button>
        )}
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </FieldTargetBar>
    </>
  );
}
