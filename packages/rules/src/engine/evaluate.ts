/**
 * Values and conditions: evaluating counts, values and conditions against state.
 */
import { getCardDef } from "../cards/definitions.js";
import type { Cond, CountExpr, Value } from "../effects/types.js";
import type { CardInstance, MatchState } from "../types.js";
import { activeDon, donOnField, otherSeat } from "./zones.js";
import { type EvalCtx, namesOfDef, relSeat, seatsFor } from "./evalCtx.js";
import { locateCard } from "./statics.js";
import { basePowerOf, costOf, powerOf } from "./stats.js";
import { asList, candidates, cmp, filterMatches, onField } from "./selectors.js";

// ---------------------------------------------------------------------------
// Values and conditions
// ---------------------------------------------------------------------------

export function evalCount(state: MatchState, ctx: EvalCtx, expr: CountExpr): number {
  switch (expr.of) {
    case "life": return seatsFor(ctx, expr.player).reduce((n: number, s) => n + state.players[s].life.length, 0);
    case "hand": return state.players[relSeat(ctx, expr.player)].hand.length;
    case "trash": return state.players[relSeat(ctx, expr.player)].trash.length;
    case "deck": return state.players[relSeat(ctx, expr.player)].deck.length;
    case "don_field": return donOnField(state.players[relSeat(ctx, expr.player)]);
    case "don_active": return activeDon(state.players[relSeat(ctx, expr.player)]).length;
    case "don_rested": return state.players[relSeat(ctx, expr.player)].costArea.filter((d) => d.rested).length;
    case "don_deck": return state.players[relSeat(ctx, expr.player)].donDeck.length;
    case "don_attached_self": { const loc = locateCard(state, ctx.sourceId); return loc?.card?.attachedDonIds.length ?? 0; }
    case "cards": return candidates(state, ctx, expr.selector).length;
    case "var": { const v = ctx.vars[expr.name]; return typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : asList(v).length; }
    case "leader_power": { const s = relSeat(ctx, expr.player); return powerOf(state, s, state.players[s].leader); }
    case "don_attached_total": return state.players[relSeat(ctx, expr.player)].attachedDons.length;
    case "self_power": { const loc = locateCard(state, ctx.sourceId); return loc?.card ? powerOf(state, loc.seat, loc.card) : 0; }
    case "self_base_power": { const loc = locateCard(state, ctx.sourceId); return loc?.card ? basePowerOf(state, loc.seat, loc.card) : 0; }
    case "battle_power": {
      const b = state.battle;
      if (!b) return 0;
      const id = expr.role === "attacker" ? b.attackerId : b.target.kind === "leader" ? state.players[otherSeat(b.attackerSeat)].leader.id : b.target.instanceId;
      const loc = locateCard(state, id);
      return loc?.card ? powerOf(state, loc.seat, loc.card) : 0;
    }
    case "sum": return expr.exprs.reduce((n, e) => n + evalCount(state, ctx, e), 0);
    case "diff": return Math.max(0, evalCount(state, ctx, expr.left) - evalCount(state, ctx, expr.right));
    case "total": return candidates(state, ctx, expr.selector).reduce((n, loc) => {
      if (expr.field === "cost") return n + (loc.card && onField(loc) ? costOf(state, loc.seat, loc.card) : getCardDef(loc.defId).cost);
      return n + (loc.card && onField(loc) ? powerOf(state, loc.seat, loc.card) : getCardDef(loc.defId).power ?? 0);
    }, 0);
    case "leader_base_power": { const s = relSeat(ctx, expr.player); return basePowerOf(state, s, state.players[s].leader); }
    case "distinct_names": return new Set(candidates(state, ctx, expr.selector).map((l) => getCardDef(l.defId).name)).size;
    case "var_sum": return asList(ctx.vars[expr.name]).reduce((n, id) => {
      const loc = locateCard(state, id);
      if (!loc) return n;
      if (expr.field === "cost") return n + (loc.card && onField(loc) ? costOf(state, loc.seat, loc.card) : getCardDef(loc.defId).cost);
      return n + (loc.card && onField(loc) ? powerOf(state, loc.seat, loc.card) : getCardDef(loc.defId).power ?? 0);
    }, 0);
  }
}

export function evalValue(state: MatchState, ctx: EvalCtx, value: Value): number {
  if (typeof value === "number") return value;
  const count = evalCount(state, ctx, value.count);
  return (value.per ? Math.floor(count / value.per) : count) * (value.times ?? 1) + (value.plus ?? 0);
}

function sourceCard(state: MatchState, ctx: EvalCtx): CardInstance | undefined {
  return locateCard(state, ctx.sourceId)?.card;
}

export function evalCond(state: MatchState, ctx: EvalCtx, cond: Cond): boolean {
  const leader = state.players[ctx.seat].leader;
  switch (cond.c) {
    case "leader_name": { const names = namesOfDef(leader.defId); return cond.names.some((n) => names.includes(n)); }
    case "leader_trait": return cond.traits.some((t) => getCardDef(leader.defId).traits?.includes(t));
    case "leader_trait_includes": return (getCardDef(leader.defId).traits ?? []).some((t) => t.includes(cond.text));
    case "leader_color": return cond.colors.some((c) => getCardDef(leader.defId).colors.includes(c));
    case "leader_multicolor": return getCardDef(leader.defId).colors.length > 1;
    case "leader_active": return !leader.rested;
    case "compare": return cmp(cond.op, evalValue(state, ctx, cond.left), evalValue(state, ctx, cond.right));
    case "exists": return candidates(state, ctx, cond.selector).length >= (cond.atLeast ?? 1);
    case "none": return candidates(state, ctx, cond.selector).length === 0;
    case "your_turn": return state.activeSeat === ctx.seat;
    case "opponent_turn": return state.activeSeat !== ctx.seat;
    case "self_don": return (sourceCard(state, ctx)?.attachedDonIds.length ?? 0) >= cond.atLeast;
    case "self_rested": return (sourceCard(state, ctx)?.rested ?? false) === cond.value;
    case "self_played_this_turn": return sourceCard(state, ctx)?.playedTurn === state.turnNumber;
    case "var_count": return cmp(cond.op, evalCount(state, ctx, { of: "var", name: cond.name }), evalValue(state, ctx, cond.value));
    case "var_all_match": { const ids = asList(ctx.vars[cond.name]); return ids.length > 0 && ids.every((id) => { const loc = locateCard(state, id); return loc != null && filterMatches(state, ctx, cond.filter, loc); }); }
    case "var_any_match": return asList(ctx.vars[cond.name]).some((id) => { const loc = locateCard(state, id); return loc != null && filterMatches(state, ctx, cond.filter, loc); });
    case "battle_against": {
      const b = state.battle;
      if (!b) return false;
      const isAttacker = b.attackerId === ctx.sourceId;
      const isTarget = b.target.kind === "character" && b.target.instanceId === ctx.sourceId || (b.target.kind === "leader" && state.players[otherSeat(b.attackerSeat)].leader.id === ctx.sourceId);
      if (!isAttacker && !isTarget) return false;
      const other = isAttacker ? (b.target.kind === "character" ? "character" : "leader") : (b.attackerId === state.players[b.attackerSeat].leader.id ? "leader" : "character");
      return other === cond.target;
    }
    case "attacker_is_self": return state.battle?.attackerId === ctx.sourceId;
    case "self_is_battle_target": {
      const b = state.battle;
      if (!b) return false;
      return b.target.kind === "character" ? b.target.instanceId === ctx.sourceId : state.players[otherSeat(b.attackerSeat)].leader.id === ctx.sourceId;
    }
    case "not": return !evalCond(state, ctx, cond.cond);
    case "and": return cond.conds.every((c) => evalCond(state, ctx, c));
    case "or": return cond.conds.some((c) => evalCond(state, ctx, c));
    case "first_turn_of_player": return state.players[ctx.seat].turnsStarted <= 1;
    case "turn_count": return cmp(cond.op, state.players[ctx.seat].turnsStarted, cond.value);
    case "battle_opponent": {
      const b = state.battle;
      if (!b) return false;
      const defenderId = b.target.kind === "leader" ? state.players[otherSeat(b.attackerSeat)].leader.id : b.target.instanceId;
      const otherId = b.attackerId === ctx.sourceId ? defenderId : defenderId === ctx.sourceId ? b.attackerId : null;
      const loc = otherId ? locateCard(state, otherId) : null;
      return loc != null && filterMatches(state, ctx, cond.filter, loc);
    }
    case "self_flag": { const card = sourceCard(state, ctx); return card != null && state.modifiers.some((m) => m.target.kind === "card" && m.target.id === card.id && m.effect.type === "flag" && m.effect.flag === cond.flag); }
    case "this_turn": {
      const log = state.players[relSeat(ctx, cond.player)].turnLog;
      if (!log || log.turn !== state.turnNumber) return false;
      if (cond.what === "hand_trashed") return log.handTrashed > 0;
      const ids = cond.what === "event_activated" ? log.events : log.koed;
      return ids.some((defId) => !cond.filter || filterMatches(state, ctx, cond.filter, { seat: relSeat(ctx, cond.player), zone: "trash", index: 0, id: "", defId }));
    }
  }
}
