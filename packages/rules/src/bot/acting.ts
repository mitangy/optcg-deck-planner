import type { MatchState, Seat } from "../types.js";

export function actingSeat(state: MatchState): Seat {
  const front = state.pendingChoices[0];
  if (front) return front.seat;
  if (state.phase === "mulligan") return state.players[0].mulliganDone ? 1 : 0;
  if ((state.phase === "block" || state.phase === "counter") && state.battle) return state.battle.attackerSeat === 0 ? 1 : 0;
  return state.activeSeat;
}
