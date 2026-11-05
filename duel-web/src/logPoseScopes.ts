/** The Log Pose chat each duel-web page belongs to (see packages/analyst-client scopes). */
import { duelDeckScope, matchScope, pageScope, plannerDeckScope, ticketGameKey, type LogPoseScope } from "@optcg/analyst-client";

/** A saved game: its chat is the match's, named by the two leaders. */
export function matchLogScope(matchId: string, yourLeader: string, opponentLeader: string): LogPoseScope | undefined {
  return pageScope(matchScope(matchId), `${yourLeader} vs ${opponentLeader}`);
}

/** A live game: the room's ticket carries the same match id the history page uses. */
export function liveMatchScope(ticket: string, yourLeader: string, opponentLeader: string): LogPoseScope | undefined {
  return matchLogScope(ticketGameKey(ticket), yourLeader, opponentLeader);
}

/** A saved duel deck. A copy linked to a planner deck shares that deck's chat with the planner app. */
export function deckEditorScope(deck: { id: string; name: string; plannerDeckId?: number }): LogPoseScope | undefined {
  const key = deck.plannerDeckId ? plannerDeckScope(deck.plannerDeckId) : duelDeckScope(deck.id);
  return pageScope(key, deck.name.trim() || "This deck");
}
