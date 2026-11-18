import { duelDeckScope, matchScope, pageScope, plannerDeckScope, ticketGameKey, type LogPoseScope } from "@optcg/analyst-client";

export function matchLogScope(matchId: string, yourLeader: string, opponentLeader: string): LogPoseScope | undefined {
  return pageScope(matchScope(matchId), `${yourLeader} vs ${opponentLeader}`);
}

export function liveMatchScope(ticket: string, yourLeader: string, opponentLeader: string): LogPoseScope | undefined {
  return matchLogScope(ticketGameKey(ticket), yourLeader, opponentLeader);
}

export function deckEditorScope(deck: { id: string; name: string; plannerDeckId?: number }): LogPoseScope | undefined {
  const key = deck.plannerDeckId ? plannerDeckScope(deck.plannerDeckId) : duelDeckScope(deck.id);
  return pageScope(key, deck.name.trim() || "This deck");
}
