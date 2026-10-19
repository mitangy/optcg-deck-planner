/** Plain-English labels for intents (#635), for position analysis. Reads the state the intent is legal in, from `seat`'s side. */
import { getCardDef } from "../cards/definitions.js";
import type { ChoiceOption, Intent, MatchState, Seat } from "../types.js";

function nameOf(defId: string | undefined): string {
  if (!defId || defId === "HIDDEN") return "a hidden card";
  try { return `${getCardDef(defId).name} (${defId})`; } catch { return defId; }
}

/** The card (name and number) standing at instance `id` on either side of the table. */
function boardName(state: MatchState, id: string, seat: Seat): string {
  for (const s of [seat, seat === 0 ? 1 : 0] as Seat[]) {
    const p = state.players[s];
    const card = p.leader.id === id ? p.leader : p.characters.find((c) => c.id === id) ?? (p.stage?.id === id ? p.stage : undefined);
    if (card) return card.id === p.leader.id ? `${s === seat ? "your" : "the opposing"} Leader ${nameOf(card.defId)}` : nameOf(card.defId);
  }
  return "a card";
}

function optionNames(options: readonly ChoiceOption[], ids: readonly string[]): string {
  return ids.map((id) => {
    const o = options.find((x) => x.id === id);
    return o ? (o.label ?? nameOf(o.defId)) : id;
  }).join(", ");
}

export function describeIntent(state: MatchState, seat: Seat, intent: Intent): string {
  const p = state.players[seat];
  const opp = state.players[seat === 0 ? 1 : 0];
  switch (intent.type) {
    case "mulligan": return intent.doMulligan ? "Mulligan (redraw the hand)" : "Keep the hand";
    case "play_card": {
      const def = p.hand[intent.handIndex]?.defId;
      const verb = def && getCardDef(def).type === "event" ? "Play Event" : "Play";
      const trash = intent.trashCharacterId ? `, replacing ${boardName(state, intent.trashCharacterId, seat)}` : "";
      return `${verb} ${nameOf(def)}${trash}`;
    }
    case "give_don": {
      const target = intent.targetId === p.leader.id ? "the Leader" : boardName(state, intent.targetId, seat);
      return `Give 1 DON!! to ${target}`;
    }
    case "activate_ability": return `Activate ${boardName(state, intent.sourceId, seat)}`;
    case "declare_attack": {
      const attacker = boardName(state, intent.attackerId, seat).replace(/^your Leader /, "");
      const target = intent.target.kind === "leader" ? "the Leader" : boardName(state, intent.target.instanceId, seat);
      const leaderNote = intent.attackerId === p.leader.id ? "your Leader " : "";
      void opp;
      return `Attack ${target} with ${leaderNote}${attacker}`;
    }
    case "declare_block": return `Block with ${boardName(state, intent.blockerId, seat)}`;
    case "pass_block": return "Do not block";
    case "counter_from_hand": return `Counter with ${nameOf(p.hand[intent.handIndex]?.defId)}`;
    case "counter_event": return `Counter with Event ${nameOf(p.hand[intent.handIndex]?.defId)}`;
    case "pass_counter": return "Do not counter";
    case "end_turn": return "End turn";
    case "order_pending_effects": return "Order the effects";
    case "resolve_pending_choice": {
      const choice = state.pendingChoices[0];
      const card = choice ? nameOf(choice.cardDefId) : "the effect";
      if (!intent.accept) return `Decline ${card}`;
      if (choice?.request && intent.selectedOptionIds?.length) return `${card}: choose ${optionNames("options" in choice.request ? choice.request.options : [], intent.selectedOptionIds)}`;
      if (choice?.kind === "life_trigger") return `Activate the Trigger of ${card}`;
      return `Accept ${card}`;
    }
  }
}
