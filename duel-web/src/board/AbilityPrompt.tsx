import { useMemo, useState } from "react";
import { lookupCard } from "../cards/atlas";
import type { Intent, PendingChoiceView, PlayerView } from "../net/protocol";

type Props = {
  view: PlayerView;
  choice: PendingChoiceView;
  onSend: (intent: Intent) => void;
};

/**
 * Structured picker for leader attack-window abilities
 * (Teach / Newgate / Rocks). Plain Accept is not enough — the engine needs
 * handIndex (+ target for Newgate/Teach).
 */
export function AbilityPrompt({ view, choice, onSend }: Props) {
  const [handIndex, setHandIndex] = useState<number | null>(null);
  const [buffTargetId, setBuffTargetId] = useState<string | null>(null);
  const [retargetLeader, setRetargetLeader] = useState(true);
  const [retargetCharId, setRetargetCharId] = useState<string | null>(null);
  const [copyPowerTargetId, setCopyPowerTargetId] = useState<string | null>(null);
  const [targetIds, setTargetIds] = useState<string[]>([]);

  const abilityId =
    choice.abilityId ??
    (choice.kind === "when_attacking" && choice.cardDefId === "OP17-039"
      ? "rocks_reveal_draw"
      : choice.kind === "leader_on_opp_attack" && choice.cardDefId === "OP17-001"
        ? "newgate_battle_power"
        : choice.kind === "leader_on_opp_attack" && choice.cardDefId === "OP16-080"
          ? "teach_redirect"
          : undefined);

  const handOptions = useMemo(() => {
    return view.you.hand
      .map((c, index) => ({ card: c, index, entry: lookupCard(c.defId) }))
      .filter(({ entry }) => {
        if (abilityId === "teach_redirect") {
          return Boolean(entry.hasTrigger || entry.effectText?.includes("[Trigger]"));
        }
        if (abilityId === "main_play_named_character") {
          return entry.type === "character" && entry.name === "Marshall.D.Teach";
        }
        return true;
      });
  }, [view.you.hand, abilityId]);

  const buffTargets = useMemo(
    () => [
      { id: view.you.leader.id, label: `Leader · ${lookupCard(view.you.leader.defId).name}` },
      ...view.you.characters
        .filter((ch) => abilityId !== "jinbe_attack_power" || ch.id !== choice.sourceInstanceId)
        .map((ch) => ({
          id: ch.id,
          label: lookupCard(ch.defId).name,
        })),
    ],
    [view.you.leader, view.you.characters, abilityId, choice.sourceInstanceId],
  );

  const retargetChars = useMemo(() => {
    return view.you.characters
      .map((ch) => ({ ch, entry: lookupCard(ch.defId) }))
      .filter(({ entry }) => (entry.traits ?? []).includes("Blackbeard Pirates"));
  }, [view.you.characters]);

  if (
    abilityId === "counter_friendly_power" ||
    abilityId === "counter_opponent_target_power" ||
    abilityId === "trigger_friendly_power"
  ) {
    const targets = abilityId === "counter_opponent_target_power"
      ? [view.opponent.leader, ...view.opponent.characters]
      : [view.you.leader, ...view.you.characters];
    return (
      <div className="ability-prompt" role="dialog" aria-label="Power effect target">
        <h3>Choose a power-effect target</h3>
        <p>{choice.prompt}</p>
        <div className="ability-prompt-row">
          {targets.map((target) => <button key={target.id} type="button" className={`ability-chip${buffTargetId === target.id ? " selected" : ""}`} onClick={() => setBuffTargetId(target.id)}>{lookupCard(target.defId).name}</button>)}
        </div>
        <div className="ability-prompt-actions">
          <button type="button" className="btn btn-primary" disabled={!buffTargetId} onClick={() => buffTargetId && onSend({ type: "resolve_pending_choice", accept: true, buffTargetId })}>Confirm</button>
          <button type="button" className="btn btn-secondary" onClick={() => onSend({ type: "resolve_pending_choice", accept: false })}>Skip</button>
        </div>
      </div>
    );
  }

  if (
    abilityId === "on_ko_set_base_power" ||
    abilityId === "on_ko_ko_opponent_cost" ||
    abilityId === "on_ko_rest_opponent_cost"
  ) {
    const ownTargets = [view.you.leader, ...view.you.characters];
    const maxTargets = choice.targetSelection?.maxTargets ?? 1;
    const maxCost = choice.targetSelection?.maxCost;
    const opponentTargets = view.opponent.characters.filter((character) => {
      const entry = lookupCard(character.defId);
      return (maxCost == null || (character.fieldCost ?? entry.cost) <= maxCost) &&
        (abilityId !== "on_ko_rest_opponent_cost" || !character.rested);
    });
    const toggle = (id: string) => setTargetIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : current.length < maxTargets ? [...current, id] : current,
    );
    return (
      <div className="ability-prompt" role="dialog" aria-label="On K.O. target selection">
        <h3>On K.O. — choose target</h3>
        <p>{choice.prompt}</p>
        <div className="ability-prompt-row">
          {abilityId === "on_ko_set_base_power"
            ? ownTargets.map((target) => <button key={target.id} type="button" className={`ability-chip${buffTargetId === target.id ? " selected" : ""}`} onClick={() => setBuffTargetId(target.id)}>{lookupCard(target.defId).name}</button>)
            : opponentTargets.map((target) => <button key={target.id} type="button" className={`ability-chip${targetIds.includes(target.id) ? " selected" : ""}`} onClick={() => toggle(target.id)}>{lookupCard(target.defId).name}</button>)}
        </div>
        <div className="ability-prompt-actions">
          <button type="button" className="btn btn-primary" disabled={abilityId === "on_ko_set_base_power" ? !buffTargetId : targetIds.length === 0} onClick={() => onSend(abilityId === "on_ko_set_base_power" ? { type: "resolve_pending_choice", accept: true, buffTargetId: buffTargetId! } : { type: "resolve_pending_choice", accept: true, targetIds })}>Confirm</button>
          <button type="button" className="btn btn-secondary" onClick={() => onSend({ type: "resolve_pending_choice", accept: false })}>Skip</button>
        </div>
      </div>
    );
  }

  const canAccept =
    abilityId === "jinbe_attack_power" ||
    (abilityId === "main_play_named_character" && handIndex != null) ||
    ((abilityId === "trigger_negate_opponent_card" ||
      abilityId === "trigger_ko_opponent_cost" ||
      abilityId === "teach_negate_leader" ||
      abilityId === "teach_negate_character") && buffTargetId != null) ||
    (abilityId === "copy_opponent_power" && copyPowerTargetId != null) ||
    (handIndex != null &&
    (abilityId === "newgate_battle_power"
      ? buffTargetId != null
      : abilityId === "teach_redirect"
        ? retargetLeader || retargetCharId != null
        : abilityId === "rocks_reveal_draw"
          ? true
          : false));

  function accept() {
    if (!canAccept) return;
    if (abilityId === "jinbe_attack_power") {
      onSend({
        type: "resolve_pending_choice",
        accept: true,
        buffTargetId: buffTargetId ?? undefined,
      });
      return;
    }
    if (abilityId === "copy_opponent_power") {
      onSend({
        type: "resolve_pending_choice",
        accept: true,
        copyPowerTargetId: copyPowerTargetId!,
      });
      return;
    }
    if (abilityId === "main_play_named_character" && handIndex != null) {
      onSend({ type: "resolve_pending_choice", accept: true, handIndex });
      return;
    }
    if (
      (abilityId === "trigger_negate_opponent_card" ||
        abilityId === "trigger_ko_opponent_cost" ||
        abilityId === "teach_negate_leader" ||
        abilityId === "teach_negate_character") &&
      buffTargetId
    ) {
      onSend({ type: "resolve_pending_choice", accept: true, buffTargetId });
      return;
    }
    if (handIndex == null) return;
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
      return;
    }
    if (abilityId === "rocks_reveal_draw") {
      onSend({
        type: "resolve_pending_choice",
        accept: true,
        handIndex,
      });
    }
  }

  const title =
    abilityId === "teach_redirect"
      ? "Teach — redirect attack"
      : abilityId === "newgate_battle_power"
        ? "Newgate — battle power"
        : abilityId === "rocks_reveal_draw"
          ? "Rocks — reveal & draw"
            : abilityId === "jinbe_attack_power"
              ? "Jinbe — power boost"
            : abilityId === "copy_opponent_power"
              ? "Devon — copy power"
              : abilityId === "main_play_named_character"
                ? "Play Marshall.D.Teach"
                : abilityId === "trigger_ko_opponent_cost"
                  ? "K.O. an opponent Character"
                  : abilityId === "trigger_negate_opponent_card" ||
                      abilityId === "teach_negate_leader" ||
                      abilityId === "teach_negate_character"
                    ? "Negate an opponent card"
                : "Ability";

  return (
    <div className="ability-prompt" role="dialog" aria-label={title}>
      <h3>{title}</h3>
      <p>{choice.prompt}</p>

      {abilityId !== "jinbe_attack_power" &&
      abilityId !== "copy_opponent_power" &&
      abilityId !== "trigger_negate_opponent_card" &&
      abilityId !== "trigger_ko_opponent_cost" &&
      abilityId !== "teach_negate_leader" &&
      abilityId !== "teach_negate_character" ? <div className="ability-prompt-section">
        <div className="ability-prompt-label">
          {abilityId === "teach_redirect"
            ? "Trash a [Trigger] card"
            : abilityId === "main_play_named_character"
              ? "Choose Marshall.D.Teach"
              : "Trash a card"}
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
      </div> : null}

      {abilityId === "newgate_battle_power" || abilityId === "jinbe_attack_power" ? (
        <div className="ability-prompt-section">
          <div className="ability-prompt-label">
            {abilityId === "jinbe_attack_power"
              ? "Give +1000 power this turn · choosing none is allowed"
              : "Give +4000 power this battle"}
          </div>
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

      {abilityId === "copy_opponent_power" ? (
        <div className="ability-prompt-section">
          <div className="ability-prompt-label">Opponent Character to copy</div>
          <div className="ability-prompt-row">
            {(view.opponent.characters ?? []).map((ch) => (
              <button
                key={ch.id}
                type="button"
                className={`ability-chip${copyPowerTargetId === ch.id ? " selected" : ""}`}
                onClick={() => setCopyPowerTargetId(ch.id)}
              >
                {lookupCard(ch.defId).name} · {ch.power ?? lookupCard(ch.defId).power ?? 0}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {abilityId === "trigger_negate_opponent_card" ||
      abilityId === "trigger_ko_opponent_cost" ||
      abilityId === "teach_negate_leader" ||
      abilityId === "teach_negate_character" ? (
        <div className="ability-prompt-section">
          <div className="ability-prompt-label">Choose an opponent card</div>
          <div className="ability-prompt-row">
            {abilityId !== "trigger_ko_opponent_cost" &&
            abilityId !== "teach_negate_character" &&
            !(abilityId === "trigger_negate_opponent_card" && choice.cardDefId === "OP16-119") ? (
              <button
                type="button"
                className={`ability-chip${buffTargetId === view.opponent.leader.id ? " selected" : ""}`}
                onClick={() => setBuffTargetId(view.opponent.leader.id)}
              >
                Leader · {lookupCard(view.opponent.leader.defId).name}
              </button>
            ) : null}
            {abilityId !== "teach_negate_leader"
              ? view.opponent.characters.map((character) => (
                  <button
                    key={character.id}
                    type="button"
                    className={`ability-chip${buffTargetId === character.id ? " selected" : ""}`}
                    onClick={() => setBuffTargetId(character.id)}
                  >
                    {lookupCard(character.defId).name}
                  </button>
                ))
              : null}
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

      {abilityId === "rocks_reveal_draw" ? (
        <p className="meta">
          Confirm trashes the selected card, reveals the top of your deck, and draws 2 if it is a
          Rocks Pirates type card.
        </p>
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
