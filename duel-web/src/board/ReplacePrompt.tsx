import { useMemo, useState } from "react";
import { lookupCard } from "../cards/atlas";
import type { Intent, PlayerView, Seat } from "../net/protocol";
import { BoardHighlight, OptionTile } from "./ChoicePrompt";
import { matchPlayCardTrash, playCardTrashTargetIds } from "./dragIntents";
import { indexLiveCards, LiveCardsContext } from "./liveTargets";

type Props = {
  view: PlayerView;
  intents: Intent[];
  handIndex: number;
  mySeat: Seat;
  onSend: (intent: Intent) => void;
  onCancel: () => void;
};

/**
 * Playing a Character onto a full board: the player picks which of their
 * Characters to trash, or cancels and keeps the card in hand. Nothing is sent
 * until a Character is chosen.
 */
export function ReplacePrompt({ view, intents, handIndex, mySeat, onSend, onCancel }: Props) {
  const liveCards = useMemo(() => indexLiveCards(view), [view]);
  const [selected, setSelected] = useState<string | null>(null);
  const card = view.you.hand[handIndex];
  const targetIds = playCardTrashTargetIds(intents, handIndex);
  const targets = view.you.characters.filter((c) => targetIds.includes(c.id));
  const name = card ? lookupCard(card.defId).name : "this card";
  const intent = selected ? matchPlayCardTrash(intents, handIndex, selected) : null;
  return (
    <LiveCardsContext.Provider value={liveCards}>
      <div className="ability-prompt choice-prompt choice-select replace-prompt" role="dialog" aria-label="Choose a Character to replace">
        <h3>Your board is full</h3>
        <p>Choose a Character to trash so {name} can take its place.</p>
        <BoardHighlight ids={targetIds} kind="candidate" />
        <div className="ability-prompt-section">
          <div className="ability-prompt-label">Replace one Character</div>
          <div className="choice-grid">
            {targets.map((c) => (
              <OptionTile
                key={c.id}
                option={{ id: c.id, defId: c.defId, instanceId: c.id, zone: "character", ownerSeat: mySeat, eligible: true }}
                mySeat={mySeat}
                selected={selected === c.id}
                disabled={false}
                onToggle={() => setSelected((cur) => (cur === c.id ? null : c.id))}
              />
            ))}
          </div>
        </div>
        <div className="ability-prompt-actions">
          <button type="button" className="btn btn-primary" disabled={!intent} onClick={() => intent && onSend(intent)}>
            Trash &amp; play
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </LiveCardsContext.Provider>
  );
}
