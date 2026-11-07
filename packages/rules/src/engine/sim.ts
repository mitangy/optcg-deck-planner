/**
 * Shared simulation handle, the acting-source marker and small helpers used by every runtime module.
 */
import { getCardDef } from "../cards/definitions.js";
import type { Rng } from "../rng.js";
import type { GameEvent, InstanceId, MatchState, Seat, TurnLog } from "../types.js";

export interface Sim {
  state: MatchState;
  events: GameEvent[];
  rng: Rng;
}

/**
 * Source of the effect currently executing (for "by your … card's effect" checks).
 *
 * Kept as dynamic scope rather than a `Sim` field on purpose: `dispatchEvent` and `findReplacement` are
 * reached from ~40 call sites that only hold a `MatchState` (battle, rules, zone moves), so carrying it
 * on `Sim` would thread `sim` through all of them for no behaviour gain. Synchronous-only: `withActing`
 * restores the previous marker in `finally`, so it must never wrap an `await` (see the facade in
 * `engine.ts`).
 */
let acting: { seat: Seat; id: InstanceId; defId: string } | null = null;

export function actingSource(): { seat: Seat; id: InstanceId; defId: string } | null {
  return acting;
}

/** Run `fn` with `source` marked as the acting effect, restoring the previous marker afterwards. */
export function withActing<T>(source: { seat: Seat; id: InstanceId; defId: string }, fn: () => T): T {
  const previous = acting;
  acting = source;
  try {
    return fn();
  } finally {
    acting = previous;
  }
}

export function turnLog(state: MatchState, seat: Seat): TurnLog {
  const p = state.players[seat];
  if (!p.turnLog || p.turnLog.turn !== state.turnNumber) p.turnLog = { turn: state.turnNumber, events: [], koed: [], handTrashed: 0 };
  return p.turnLog;
}

export function nameOf(defId: string): string {
  try { return getCardDef(defId).name; } catch { return defId; }
}
