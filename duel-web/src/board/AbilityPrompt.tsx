import { useMemo, useState } from "react";
import { lookupCard } from "../cards/atlas";
import type { Intent, PendingChoiceView, PlayerView } from "../net/protocol";

type Props = {
  view: PlayerView;
  choice: PendingChoiceView;
  onSend: (intent: Intent) => void;
};

/**
 * Structured picker for leader On-Opponent's-Attack abilities (Teach / Newgate).
 * Plain Accept is not enough — the engine needs handIndex (+ target).
 */
export function AbilityPrompt({ view, choice, onSend }: Props) {
  const [handIndex, setHandIndex] = useState<number | null>(null);
  const [buffTargetId, setBuffTargetId] = useState<string | null>(null);
  const [retargetLeader, setRetargetLeader] = useState(true);
  const [retargetCharId, setRetargetCharId] = useState<string | null>(null);

  const abilityId = choice.abilityId;

  const handOptions = useMemo(() => {
    return view.you.hand
      .map((c, index) => ({ card: c, index, entry: lookupCard(c.defId) }))
      .filter(({ entry }) => {
        if (abilityId === "teach_redirect") {
          return Boolean(entry.hasTrigger || entry.effectText?.includes("[Trigger]"));
        }
        return true;
      });
  }, [view.you.hand, abilityId]);

  const buffTargets = useMemo(
    () => [
      { id: view.you.leader.id, label: `Leader · ${lookupCard(view.you.leader.defId).name}` },
      ...view.you.characters.map((ch) => ({
        id: ch.id,
        label: lookupCard(ch.defId).name,
      })),
    ],
    [view.you.leader, view.you.characters],
  );

  const retargetChars = useMemo(() => {
    return view.you.characters
      .map((ch) => ({ ch, entry: lookupCard(ch.defId) }))
      .filter(({ entry }) => (entry.traits ?? []).includes("Blackbeard Pirates"));
  }, [view.you.characters]);

  const canAccept =
    handIndex != null &&
    (abilityId === "newgate_battle_power"
      ? buffTargetId != null
      : abilityId === "teach_redirect"
        ? retargetLeader || retargetCharId != null
        : false);

  function accept() {
    if (!canAccept || handIndex == null) return;
    if (abilityId === "newgate_battle_power" && buffTargetId) {
      onSend({
        type: "resolve_pending_choice",
        accept: true,
        handIndex,
        buffTargetId,
      });
      return;
    }
    if (abilityId === "teach_redirect") {
      onSend({
        type: "resolve_pending_choice",
        accept: true,
        handIndex,
        newTarget: retargetLeader
          ? { kind: "leader" }
          : { kind: "character", instanceId: retargetCharId! },
      });
    }
  }

  const title =
    abilityId === "teach_redirect"
      ? "Teach — redirect attack"
      : abilityId === "newgate_battle_power"
        ? "Newgate — battle power"
        : "Leader ability";

  return (
    <div className="ability-prompt" role="dialog" aria-label={title}>
      <h3>{title}</h3>
      <p>{choice.prompt}</p>

      <div className="ability-prompt-section">
        <div className="ability-prompt-label">
          {abilityId === "teach_redirect" ? "Trash a [Trigger] card" : "Trash a card"}
        </div>
        <div className="ability-prompt-row">
          {handOptions.length === 0 ? (
            <span className="meta">No valid cards in hand — decline or wait</span>
          ) : (
            handOptions.map(({ card, index, entry }) => (
              <button
                key={card.id}
                type="button"
                className={`ability-chip${handIndex === index ? " selected" : ""}`}
                onClick={() => setHandIndex(index)}
              >
                {entry.name}
              </button>
            ))
          )}
        </div>
      </div>

      {abilityId === "newgate_battle_power" ? (
        <div className="ability-prompt-section">
          <div className="ability-prompt-label">Give +4000 power this battle</div>
          <div className="ability-prompt-row">
            {buffTargets.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`ability-chip${buffTargetId === t.id ? " selected" : ""}`}
                onClick={() => setBuffTargetId(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {abilityId === "teach_redirect" ? (
        <div className="ability-prompt-section">
          <div className="ability-prompt-label">New attack target</div>
          <div className="ability-prompt-row">
            <button
              type="button"
              className={`ability-chip${retargetLeader ? " selected" : ""}`}
              onClick={() => {
                setRetargetLeader(true);
                setRetargetCharId(null);
              }}
            >
              Leader · {lookupCard(view.you.leader.defId).name}
            </button>
            {retargetChars.map(({ ch, entry }) => (
              <button
                key={ch.id}
                type="button"
                className={`ability-chip${!retargetLeader && retargetCharId === ch.id ? " selected" : ""}`}
                onClick={() => {
                  setRetargetLeader(false);
                  setRetargetCharId(ch.id);
                }}
              >
                {entry.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="ability-prompt-actions">
        <button type="button" className="btn btn-primary" disabled={!canAccept} onClick={accept}>
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
