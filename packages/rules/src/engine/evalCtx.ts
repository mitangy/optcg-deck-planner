/**
 * Evaluation context shared by selectors, values and conditions, plus card-name aliases.
 */
import { abilitiesFor } from "../cards/abilities.js";
import { getCardDef } from "../cards/definitions.js";
import type { BindingValue, InstanceId, Seat } from "../types.js";
import { otherSeat } from "./state.js";

export interface EvalCtx {
  seat: Seat;
  sourceId: InstanceId;
  sourceDefId: string;
  vars: Record<string, BindingValue>;
  eventCardId?: InstanceId;
}

export function ctxFor(seat: Seat, source: { id: InstanceId; defId: string }, vars: Record<string, BindingValue> = {}): EvalCtx {
  return { seat, sourceId: source.id, sourceDefId: source.defId, vars };
}

export const relSeat = (ctx: { seat: Seat }, rel: "you" | "opponent"): Seat => (rel === "you" ? ctx.seat : otherSeat(ctx.seat));
export const seatsFor = (ctx: { seat: Seat }, rel: "you" | "opponent" | "any"): Seat[] => (rel === "any" ? [ctx.seat, otherSeat(ctx.seat)] : [relSeat(ctx, rel)]);

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

const aliasCache = new Map<string, string[]>();
export function namesOfDef(defId: string): string[] {
  const hit = aliasCache.get(defId);
  if (hit) return hit;
  const names = [getCardDef(defId).name];
  for (const ability of abilitiesFor(defId)) for (const s of ability.statics ?? []) if (s.s === "name_alias") names.push(...s.names);
  aliasCache.set(defId, names);
  return names;
}
