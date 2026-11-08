import { lookupCard } from "../../cards/atlas";
import type { Intent, PlayerView } from "@optcg/duel-protocol";

/** Name of a card for a button label: the atlas name, else the id. Injected so the label logic needs no card atlas. */
export type NameForDef = (defId: string | undefined) => string | null;

function shortId(id: unknown): string {
  return String(id ?? "?").slice(0, 8);
}

export const atlasNameForDef: NameForDef = (defId) => {
  if (!defId) return null;
  const n = lookupCard(defId).name;
  return n && n !== defId ? n : defId;
};

function findBoardName(view: PlayerView | undefined, instanceId: unknown, nameForDef: NameForDef): string {
  if (!view || instanceId == null) return shortId(instanceId);
  const id = String(instanceId);
  if (view.you.leader.id === id) return nameForDef(view.you.leader.defId) ?? shortId(id);
  if (view.you.stage?.id === id) return nameForDef(view.you.stage.defId) ?? shortId(id);
  const ch = view.you.characters.find((c) => c.id === id);
  if (ch) return nameForDef(ch.defId) ?? shortId(id);
  if (view.opponent.leader.id === id) {
    return nameForDef(view.opponent.leader.defId) ?? shortId(id);
  }
  if (view.opponent.stage?.id === id) {
    return nameForDef(view.opponent.stage.defId) ?? shortId(id);
  }
  const och = view.opponent.characters.find((c) => c.id === id);
  if (och) return nameForDef(och.defId) ?? shortId(id);
  return shortId(id);
}

function handName(view: PlayerView | undefined, handIndex: unknown, nameForDef: NameForDef): string {
  if (!view || typeof handIndex !== "number") return `#${String(handIndex)}`;
  const card = view.you.hand[handIndex];
  if (!card) return `#${handIndex}`;
  return nameForDef(card.defId) ?? `#${handIndex}`;
}

/** The label of an intent as its button reads. `activate_leader` is the pre-`activate_ability` shape older callers still pass. */
export function intentLabel(
  anIntent: Intent | { type: "activate_leader"; targetId?: string },
  view?: PlayerView,
  nameForDef: NameForDef = atlasNameForDef,
): string {
  const intent = anIntent;
  const boardName = (instanceId: unknown) => findBoardName(view, instanceId, nameForDef);
  const handCardName = (handIndex: unknown) => handName(view, handIndex, nameForDef);
  switch (intent.type) {
    case "mulligan":
      return intent.doMulligan ? "Mulligan (redraw 5)" : "Keep opening hand";
    case "play_card":
      // Full board: one legal play per Character that could be trashed, so
      // name the one this button replaces.
      return intent.trashCharacterId != null
        ? `Play ${handCardName(intent.handIndex)}, replacing ${boardName(intent.trashCharacterId)}`
        : `Play ${handCardName(intent.handIndex)}`;
    case "give_don":
      return `Give DON → ${boardName(intent.targetId)}`;
    case "activate_leader":
      return `Activate Leader → ${boardName(intent.targetId)}`;
    case "activate_ability": {
      const source = boardName(intent.sourceId);
      const target =
        intent.targetId != null ? boardName(intent.targetId) : null;
      return target ? `Activate ${source} → ${target}` : `Activate ${source}`;
    }
    case "declare_attack": {
      const target = intent.target as { kind?: string; instanceId?: string } | undefined;
      if (target?.kind === "leader") {
        return `Attack Leader (${boardName(view?.opponent.leader.id)})`;
      }
      if (target?.kind === "character") {
        return `Attack ${boardName(target.instanceId)}`;
      }
      return `Attack ${JSON.stringify(intent.target)}`;
    }
    case "declare_block":
      return `Block (${boardName(intent.blockerId)})`;
    case "pass_block":
      return "Pass block";
    case "counter_from_hand":
      return `Counter ${handCardName(intent.handIndex)}`;
    case "counter_event":
      return `Counter event ${handCardName(intent.handIndex)}`;
    case "pass_counter":
      return "Pass counter";
    case "resolve_pending_choice": {
      const front = view?.pendingChoices?.[0];
      const who = front ? nameForDef(front.cardDefId) ?? front.cardDefId : "ability";
      if (!intent.accept) return `Decline — ${who}`;
      return front?.request?.type === "confirm" || !front?.request ? `Accept — ${who}` : `Resolve — ${who}`;
    }
    case "order_pending_effects":
      return "Confirm effect order";
    case "end_turn":
      return "End turn";
    default:
      return (intent as { type: string }).type;
  }
}

