import { useEffect, useMemo, useState } from "react";
import { lookupCard } from "../cards/atlas";
import type { Intent, PendingChoiceView, PlayerView } from "../net/protocol";

type Props = {
  view: PlayerView;
  choice: PendingChoiceView;
  onSend: (intent: Intent) => void;
};

export function SearchPrompt({ view, choice, onSend }: Props) {
  const options = choice.search?.options ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [remainderIds, setRemainderIds] = useState(() => options.map((option) => option.id));
  const [handIndex, setHandIndex] = useState<number | null>(null);

  useEffect(() => {
    setRemainderIds(options.filter((option) => option.id !== selectedId).map((option) => option.id));
  }, [choice.id, selectedId]);

  const byId = useMemo(
    () => new Map(options.map((option) => [option.id, option])),
    [options],
  );

  function move(id: string, delta: -1 | 1) {
    setRemainderIds((current) => {
      const index = current.indexOf(id);
      const nextIndex = index + delta;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
      return next;
    });
  }

  if (choice.kind === "activate_main" && choice.abilityId === "fullalead_search_cost") {
    return (
      <div className="ability-prompt" role="dialog" aria-label="Fullalead search cost">
        <h3>Fullalead — activate search</h3>
        <p>{choice.prompt}</p>
        <div className="ability-prompt-section">
          <div className="ability-prompt-label">Trash 1 card from your hand</div>
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
            disabled={handIndex == null}
            onClick={() =>
              onSend({ type: "resolve_pending_choice", accept: true, handIndex })
            }
          >
            Pay cost &amp; search
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onSend({ type: "resolve_pending_choice", accept: false })}
          >
            Decline
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ability-prompt search-prompt" role="dialog" aria-label="Top deck search">
      <h3>Search the top of your deck</h3>
      <p>{choice.prompt}</p>
      <div className="ability-prompt-section">
        <div className="ability-prompt-label">Choose up to 1 eligible card</div>
        <div className="ability-prompt-row search-option-row">
          {options.map((option) => {
            const entry = lookupCard(option.defId);
            const selected = selectedId === option.id;
            return (
              <button
                key={option.id}
                type="button"
                className={`ability-chip${selected ? " selected" : ""}`}
                disabled={!option.eligible}
                title={option.eligible ? entry.effectText : "This card does not match the search"}
                onClick={() => setSelectedId(selected ? null : option.id)}
              >
                {entry.name}
                {!option.eligible ? " · not eligible" : ""}
              </button>
            );
          })}
        </div>
      </div>
      <div className="ability-prompt-section">
        <div className="ability-prompt-label">
          {choice.search?.remainder === "trash"
            ? "Cards sent to trash"
            : "Order above → bottom · last row is bottommost"}
        </div>
        <ol className="search-order-list">
          {remainderIds.map((id, index) => {
            const option = byId.get(id)!;
            return (
              <li key={id}>
                <span>{lookupCard(option.defId).name}</span>
                <span className="search-order-actions">
                  <button type="button" disabled={choice.search?.remainder === "trash" || index === 0} onClick={() => move(id, -1)} aria-label="Move up">
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={choice.search?.remainder === "trash" || index === remainderIds.length - 1}
                    onClick={() => move(id, 1)}
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="ability-prompt-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            onSend({
              type: "resolve_pending_choice",
              accept: true,
              selectedOptionId: selectedId ?? undefined,
              orderedOptionIds: remainderIds,
            })
          }
        >
          {selectedId ? "Take card & finish" : "Take no card & finish"}
        </button>
      </div>
    </div>
  );
}
