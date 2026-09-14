import { useState } from "react";
import { lookupCard } from "../cards/atlas";
import type { Intent, PendingChoiceView, PlayerView } from "../net/protocol";

type Props = {
  view: PlayerView;
  choice: PendingChoiceView;
  onSend: (intent: Intent) => void;
};

export function OnPlayPrompt({ view, choice, onSend }: Props) {
  const [handIndex, setHandIndex] = useState<number | null>(null);
  const [lifeChoice, setLifeChoice] = useState<"own_life" | "opp_life" | null>(null);

  const abilityId = choice.abilityId;

  if (abilityId === "on_play_hand_to_deck") {
    const canConfirm = handIndex != null;
    return (
      <div className="ability-prompt" role="dialog" aria-label="On Play">
        <h3>On Play</h3>
        <p>{choice.prompt}</p>
        <div className="ability-prompt-section">
          <div className="ability-prompt-label">Place on deck top</div>
          <div className="ability-prompt-row">
            {view.you.hand.map((card, index) => (
              <button
                key={card.id}
                type="button"
                className={`ability-chip${handIndex === index ? " selected" : ""}`}
                onClick={() => setHandIndex(index)}
              >
                {lookupCard(card.defId).name}
              </button>
            ))}
          </div>
        </div>
        <div className="ability-prompt-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canConfirm}
            onClick={() => {
              if (handIndex == null) return;
              onSend({
                type: "resolve_pending_choice",
                accept: true,
                handIndex,
              });
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    );
  }

  if (abilityId === "on_play_life_choice") {
    const canOwn = view.you.deckCount > 0;
    const canOpp = view.opponent.lifeCount > 0;
    const canConfirm = lifeChoice != null;
    return (
      <div className="ability-prompt" role="dialog" aria-label="On Play">
        <h3>On Play</h3>
        <p>{choice.prompt}</p>
        <div className="ability-prompt-section">
          <div className="ability-prompt-label">Choose one</div>
          <div className="ability-prompt-row">
            <button
              type="button"
              className={`ability-chip${lifeChoice === "own_life" ? " selected" : ""}`}
              disabled={!canOwn}
              onClick={() => setLifeChoice("own_life")}
            >
              Your deck top → Life
            </button>
            <button
              type="button"
              className={`ability-chip${lifeChoice === "opp_life" ? " selected" : ""}`}
              disabled={!canOpp}
              onClick={() => setLifeChoice("opp_life")}
            >
              Opponent Life top → their hand
            </button>
          </div>
        </div>
        <div className="ability-prompt-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canConfirm}
            onClick={() => {
              if (!lifeChoice) return;
              onSend({
                type: "resolve_pending_choice",
                accept: true,
                onPlayChoice: lifeChoice,
              });
            }}
          >
            Confirm
          </button>
          {choice.optional ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onSend({ type: "resolve_pending_choice", accept: false })}
            >
              Decline
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return null;
}
