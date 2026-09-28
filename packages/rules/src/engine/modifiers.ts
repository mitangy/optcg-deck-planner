/** Duration-limited effects ("during this turn", "until the start of your next turn", …). */
import type { Duration } from "../effects/types.js";
import type { MatchState, Modifier, ModifierEffect, ModifierExpiry, Seat } from "../types.js";
import { alloc } from "./state.js";

/** Absolute turn number of `seat`'s next turn (assumes alternating turns). */
export function nextTurnOf(state: MatchState, seat: Seat): number {
  return state.activeSeat === seat ? state.turnNumber + 2 : state.turnNumber + 1;
}

export function expiryFor(state: MatchState, seat: Seat, duration: Duration): ModifierExpiry {
  switch (duration) {
    case "battle": return state.battle ? { kind: "battle" } : { kind: "end_of_turn", turn: state.turnNumber };
    case "turn": return { kind: "end_of_turn", turn: state.turnNumber };
    case "until_start_of_your_next_turn": return { kind: "start_of_turn", turn: nextTurnOf(state, seat) };
    case "until_end_of_opponent_next_turn": return { kind: "end_of_turn", turn: nextTurnOf(state, seat === 0 ? 1 : 0) };
    case "until_end_of_your_next_turn": return { kind: "end_of_turn", turn: nextTurnOf(state, seat) };
    case "permanent": return { kind: "permanent" };
  }
}

export function addModifier(state: MatchState, seat: Seat, sourceId: string | undefined, target: Modifier["target"], effect: ModifierEffect, expires: ModifierExpiry): Modifier {
  const modifier: Modifier = { id: alloc(state, "mod"), sourceSeat: seat, ...(sourceId ? { sourceId } : {}), target, effect, expires };
  state.modifiers.push(modifier);
  return modifier;
}

export function expireBattle(state: MatchState): void {
  state.modifiers = state.modifiers.filter((m) => m.expires.kind !== "battle");
}

export function expireEndOfTurn(state: MatchState): void {
  state.modifiers = state.modifiers.filter((m) => !(m.expires.kind === "end_of_turn" && m.expires.turn <= state.turnNumber));
}

export function expireStartOfTurn(state: MatchState): void {
  state.modifiers = state.modifiers.filter((m) => !(m.expires.kind === "start_of_turn" && m.expires.turn <= state.turnNumber));
}
