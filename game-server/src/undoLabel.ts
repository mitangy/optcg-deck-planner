import { getCardDef, hasCardDef, type CardInstance, type Intent, type MatchState, type Seat } from "@optcg/rules";

/** Longest label sent to clients (they render it inside a button title and a dialog). */
const MAX_LABEL = 60;

function nameOf(defId: string | undefined): string | null {
  if (!defId || !hasCardDef(defId)) return null;
  return getCardDef(defId).name;
}

function boardCard(state: MatchState, id: string): CardInstance | null {
  for (const p of state.players) {
    if (p.leader.id === id) return p.leader;
    if (p.stage?.id === id) return p.stage;
    const c = p.characters.find((x) => x.id === id);
    if (c) return c;
  }
  return null;
}

/**
 * Short human description of an intent about to be applied to `before`, shown
 * in the undo button and the opponent's request. Names only cards the
 * opponent sees as a result of the action (cards played, countered with, or
 * already on the board); a private decision stays generic.
 */
export function undoLabel(before: MatchState, seat: Seat, intent: Intent): string {
  const label = describe(before, seat, intent);
  return label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 1)}…` : label;
}

function describe(before: MatchState, seat: Seat, intent: Intent): string {
  const hand = before.players[seat].hand;
  const board = (id: string) => nameOf(boardCard(before, id)?.defId);
  switch (intent.type) {
    case "play_card": {
      const n = nameOf(hand[intent.handIndex]?.defId);
      return n ? `play ${n}` : "play a card";
    }
    case "give_don": {
      const n = board(intent.targetId);
      return n ? `give DON!! to ${n}` : "give DON!!";
    }
    case "activate_ability": {
      const n = board(intent.sourceId);
      return n ? `activate ${n}'s effect` : "activate an effect";
    }
    case "declare_attack": {
      const n = board(intent.attackerId);
      return n ? `attack with ${n}` : "attack";
    }
    case "declare_block": {
      const n = board(intent.blockerId);
      return n ? `block with ${n}` : "block";
    }
    case "pass_block":
      return "pass block";
    case "counter_from_hand":
    case "counter_event": {
      const n = nameOf(hand[intent.handIndex]?.defId);
      return n ? `counter with ${n}` : "counter";
    }
    case "pass_counter":
      return "pass counter";
    case "resolve_pending_choice":
      return "make a choice";
    case "order_pending_effects":
      return "order effects";
    case "end_turn":
      return "end turn";
    case "mulligan":
      return "mulligan";
  }
}
