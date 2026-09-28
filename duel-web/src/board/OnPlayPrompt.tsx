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
  const [targetId, setTargetId] = useState<string | null>(null);
  const [trashOptionId, setTrashOptionId] = useState<string | null>(null);
  const [handIndices, setHandIndices] = useState<number[]>([]);
  const [selectedDonIds, setSelectedDonIds] = useState<string[]>([]);

  const abilityId = choice.abilityId;

  if (abilityId === "on_ko_return_don_add_life" || abilityId === "counter_rest_don_opponent_all") {
    const count = choice.donOptions?.length ? 1 : 0;
    const toggle = (id: string) => {
      setSelectedDonIds((current) =>
        current.includes(id)
          ? current.filter((value) => value !== id)
          : current.length < count
            ? [...current, id]
            : current,
      );
    };
    return (
      <div className="ability-prompt" role="dialog" aria-label="On K.O. DON cost">
        <h3>{abilityId === "counter_rest_don_opponent_all" ? "Rest DON!!" : "On K.O. — return DON!!"}</h3>
        <p>{choice.prompt}</p>
        <div className="ability-prompt-row">
          {(choice.donOptions ?? []).map((don, index) => (
            <button key={don.id} type="button" className={`ability-chip${selectedDonIds.includes(don.id) ? " selected" : ""}`} onClick={() => toggle(don.id)}>
              DON!! {index + 1} · {don.attachedTo ? "attached" : don.rested ? "rested" : "active"}
            </button>
          ))}
        </div>
        <div className="ability-prompt-actions">
          <button type="button" className="btn btn-primary" disabled={selectedDonIds.length !== count} onClick={() => onSend({ type: "resolve_pending_choice", accept: true, selectedDonIds })}>Confirm</button>
          <button type="button" className="btn btn-secondary" onClick={() => onSend({ type: "resolve_pending_choice", accept: false })}>Decline</button>
        </div>
      </div>
    );
  }

  if (abilityId === "on_ko_revive_self") {
    const eligible = view.you.hand
      .map((card, index) => ({ card, index, entry: lookupCard(card.defId) }))
      .filter(({ entry }) => (entry.traits ?? []).some((trait) => trait.includes("Whitebeard Pirates")));
    return (
      <div className="ability-prompt" role="dialog" aria-label="On K.O. revival">
        <h3>On K.O. — revive Marco</h3>
        <p>{choice.prompt}</p>
        <div className="ability-prompt-row">
          {eligible.map(({ card, index, entry }) => (
            <button key={card.id} type="button" className={`ability-chip${handIndex === index ? " selected" : ""}`} onClick={() => setHandIndex(index)}>{entry.name}</button>
          ))}
        </div>
        <div className="ability-prompt-actions">
          <button type="button" className="btn btn-primary" disabled={handIndex == null} onClick={() => handIndex != null && onSend({ type: "resolve_pending_choice", accept: true, handIndex })}>Confirm</button>
          <button type="button" className="btn btn-secondary" onClick={() => onSend({ type: "resolve_pending_choice", accept: false })}>Decline</button>
        </div>
      </div>
    );
  }

  if (abilityId === "main_trash_trigger_to_hand" || abilityId === "trigger_play_trash_character") {
    return (
      <div className="ability-prompt" role="dialog" aria-label="Trash retrieval">
        <h3>{abilityId === "trigger_play_trash_character" ? "Play a Character from trash" : "Choose a Trigger card from trash"}</h3>
        <p>{choice.prompt}</p>
        <div className="ability-prompt-row">
          {(choice.trashOptions ?? []).filter((option) => option.eligible).map((option) => (
            <button key={option.id} type="button" className={`ability-chip${trashOptionId === option.id ? " selected" : ""}`} onClick={() => setTrashOptionId(option.id)}>{lookupCard(option.defId).name}</button>
          ))}
        </div>
        <div className="ability-prompt-actions">
          <button type="button" className="btn btn-primary" disabled={!trashOptionId} onClick={() => trashOptionId && onSend({ type: "resolve_pending_choice", accept: true, selectedTrashOptionId: trashOptionId })}>Confirm</button>
          <button type="button" className="btn btn-secondary" onClick={() => onSend({ type: "resolve_pending_choice", accept: false })}>Skip</button>
        </div>
      </div>
    );
  }

  if (abilityId === "on_play_reveal_draw_trash" || abilityId === "discard_hand_count") {
    const count = choice.handSelection?.count ?? 0;
    const qualifyingPower = choice.handSelection?.qualifyingPower;
    const toggle = (index: number) => {
      setHandIndices((current) =>
        current.includes(index)
          ? current.filter((value) => value !== index)
          : current.length < count
            ? [...current, index]
            : current,
      );
    };
    return (
      <div className="ability-prompt" role="dialog" aria-label="Hand selection">
        <h3>{abilityId === "discard_hand_count" ? "Trash cards" : "Reveal cards"}</h3>
        <p>{choice.prompt}</p>
        <div className="ability-prompt-section">
          <div className="ability-prompt-label">Choose exactly {count}</div>
          <div className="ability-prompt-row">
            {view.you.hand.map((card, index) => {
              const entry = lookupCard(card.defId);
              const eligible = qualifyingPower == null || (entry.type === "character" && entry.power === qualifyingPower);
              return (
                <button key={card.id} type="button" disabled={!eligible} className={`ability-chip${handIndices.includes(index) ? " selected" : ""}`} onClick={() => toggle(index)}>
                  {entry.name}
                </button>
              );
            })}
          </div>
        </div>
        <div className="ability-prompt-actions">
          <button type="button" className="btn btn-primary" disabled={handIndices.length !== count} onClick={() => onSend({ type: "resolve_pending_choice", accept: true, handIndices })}>Confirm</button>
          {choice.optional ? <button type="button" className="btn btn-secondary" onClick={() => onSend({ type: "resolve_pending_choice", accept: false })}>Decline</button> : null}
        </div>
      </div>
    );
  }

  if (abilityId === "on_play_power_debuff" || abilityId === "on_play_ko_power") {
    return (
      <div className="ability-prompt" role="dialog" aria-label="On Play">
        <h3>On Play</h3>
        <p>{choice.prompt}</p>
        <div className="ability-prompt-section">
          <div className="ability-prompt-label">
            {abilityId === "on_play_ko_power" ? "Choose an opponent Character to K.O." : "Choose a rested opponent Character"}
          </div>
          <div className="ability-prompt-row">
            {view.opponent.characters.map((character) => (
              <button
                key={character.id}
                type="button"
                className={`ability-chip${targetId === character.id ? " selected" : ""}`}
                disabled={abilityId === "on_play_power_debuff" ? !character.rested : (character.printedPower ?? character.power ?? 0) > 7000}
                onClick={() => setTargetId(character.id)}
              >
                {lookupCard(character.defId).name}
              </button>
            ))}
          </div>
        </div>
        <div className="ability-prompt-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!targetId}
            onClick={() => targetId && onSend({ type: "resolve_pending_choice", accept: true, buffTargetId: targetId })}
          >
            Confirm
          </button>
          {choice.optional ? (
            <button type="button" className="btn btn-secondary" onClick={() => onSend({ type: "resolve_pending_choice", accept: false })}>
              Decline
            </button>
          ) : null}
        </div>
      </div>
    );
  }

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

  if (abilityId === "on_play_trash_hand_to_life") {
    return (
      <div className="ability-prompt" role="dialog" aria-label="On Play">
        <h3>On Play — move a card to Life</h3>
        <p>{choice.prompt}</p>
        <div className="ability-prompt-section">
          <div className="ability-prompt-label">Trash 1 card from your hand</div>
          <div className="ability-prompt-row">
            {view.you.hand.map((card, index) => (
              <button key={card.id} type="button" className={`ability-chip${handIndex === index ? " selected" : ""}`} onClick={() => setHandIndex(index)}>
                {lookupCard(card.defId).name}
              </button>
            ))}
          </div>
        </div>
        <div className="ability-prompt-section">
          <div className="ability-prompt-label">Choose a card from trash</div>
          <div className="ability-prompt-row">
            {(choice.trashOptions ?? []).filter((option) => option.eligible).map((option) => (
              <button key={option.id} type="button" className={`ability-chip${trashOptionId === option.id ? " selected" : ""}`} onClick={() => setTrashOptionId(option.id)}>
                {lookupCard(option.defId).name}
              </button>
            ))}
          </div>
        </div>
        <div className="ability-prompt-actions">
          <button type="button" className="btn btn-primary" disabled={handIndex == null || trashOptionId == null} onClick={() => handIndex != null && trashOptionId && onSend({ type: "resolve_pending_choice", accept: true, handIndex, selectedTrashOptionId: trashOptionId })}>Confirm</button>
          {choice.optional ? <button type="button" className="btn btn-secondary" onClick={() => onSend({ type: "resolve_pending_choice", accept: false })}>Decline</button> : null}
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
