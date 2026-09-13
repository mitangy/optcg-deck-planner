import { useMemo, useState } from "react";
import { lookupCard } from "../cards/atlas";
import type { Intent, PendingChoiceView } from "../net/protocol";

type Props = {
  choice: PendingChoiceView;
  onSend: (intent: Intent) => void;
};

/**
 * Lets the controlling player reorder simultaneous effects.
 * `legalIntents` only exposes a default (wrapper) sequence for sims/bots —
 * this UI is the real player-facing ordering path.
 */
export function EffectOrderPrompt({ choice, onSend }: Props) {
  const initial = choice.unorderedChoices ?? [];
  const [order, setOrder] = useState<PendingChoiceView[]>(() => [...initial]);

  const labels = useMemo(() => {
    return order.map((c) => {
      const entry = lookupCard(c.cardDefId);
      return {
        id: c.id,
        title: entry?.name ?? c.cardDefId,
        detail: c.prompt,
      };
    });
  }, [order]);

  function move(index: number, dir: -1 | 1) {
    const next = index + dir;
    if (next < 0 || next >= order.length) return;
    setOrder((prev) => {
      const copy = [...prev];
      const tmp = copy[index]!;
      copy[index] = copy[next]!;
      copy[next] = tmp;
      return copy;
    });
  }

  function confirm() {
    onSend({
      type: "order_pending_effects",
      orderedIds: order.map((c) => c.id),
    });
  }

  return (
    <div className="ability-prompt effect-order-prompt" role="dialog" aria-label="Order effects">
      <h3>Order simultaneous effects</h3>
      <p>{choice.prompt}</p>
      <div className="ability-prompt-section">
        <div className="ability-prompt-label">Resolve top to bottom</div>
        <ol className="effect-order-list">
          {labels.map((row, index) => (
            <li key={row.id} className="effect-order-item">
              <div className="effect-order-text">
                <strong>{row.title}</strong>
                <span>{row.detail}</span>
              </div>
              <div className="effect-order-move">
                <button
                  type="button"
                  className="ability-chip"
                  disabled={index === 0}
                  aria-label={`Move ${row.title} up`}
                  onClick={() => move(index, -1)}
                >
                  Up
                </button>
                <button
                  type="button"
                  className="ability-chip"
                  disabled={index === labels.length - 1}
                  aria-label={`Move ${row.title} down`}
                  onClick={() => move(index, 1)}
                >
                  Down
                </button>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="ability-prompt-actions">
        <button type="button" className="btn btn-primary" onClick={confirm}>
          Confirm order
        </button>
      </div>
    </div>
  );
}
