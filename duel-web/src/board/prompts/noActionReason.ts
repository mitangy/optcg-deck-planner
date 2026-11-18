import { lookupCard } from "../../cards/atlas";
import { counterValueFor } from "../../cards/counterValue";
import type { PlayerView } from "../../net/protocol";
import { blockedReason, donShortfall } from "../hand/handAffordance";

type Selection = { handIndex: number | null; boardId: string | null };

function noun(type: string): string {
  return type === "leader" ? "Leader" : type === "stage" ? "Stage" : "Character";
}

function isCounterOnlyEvent(defId: string): boolean {
  const def = lookupCard(defId);
  if (def.type !== "event") return false;
  const text = def.effectText ?? "";
  return text.includes("[Counter]") && !text.includes("[Main]");
}

function reasonForHandCard(view: PlayerView, handIndex: number, defending: boolean): string | null {
  const card = view.you.hand[handIndex];
  if (!card) return null;
  const def = lookupCard(card.defId);
  if (defending) {
    return counterValueFor(def) == null && card.counter == null ? "Only Counter cards can be played now" : null;
  }
  if (view.activeSeat !== view.seat) return "Not your turn";
  if (view.phase !== "main") return null;
  if (card.blocked) return blockedReason(card.blocked);
  if (isCounterOnlyEvent(card.defId)) return "Counter: play this when you are attacked";
  const cost = card.playCost ?? def.cost;
  if (def.type !== "unknown" && donShortfall(cost, view.you.activeDonCount) > 0) {
    return `Needs ${cost} DON!! (you have ${view.you.activeDonCount} active)`;
  }
  return null;
}

function reasonForBoardCard(view: PlayerView, boardId: string): string | null {
  const me = view.you;
  const card = me.leader.id === boardId ? me.leader : me.characters.find((c) => c.id === boardId);
  if (!card) return null;
  if (view.activeSeat !== view.seat) return "Not your turn";
  if (view.phase !== "main") return null;
  const what = noun(lookupCard(card.defId).type);
  if (card.statusLabels.includes("Cannot attack")) return `This ${what} cannot attack`;
  if (card.rested) return `This ${what} already attacked or is rested`;
  if (card.summoningSick || card.statusLabels.includes("Summoning sick")) return "Can't attack the turn it is played";
  if (view.turnNumber <= 1) return "The first player can't attack on turn 1";
  return null;
}

// Why a selected card has no action, from what the client already knows; null when there is no known reason.
export function noActionReason(view: PlayerView, sel: Selection): string | null {
  if (view.winner != null) return null;
  if (view.pendingChoices?.length) return "Answer the prompt first";
  const defending = (view.phase === "block" || view.phase === "counter") && view.activeSeat !== view.seat;
  if (sel.handIndex != null) return reasonForHandCard(view, sel.handIndex, defending);
  if (sel.boardId != null) return defending ? null : reasonForBoardCard(view, sel.boardId);
  return null;
}
