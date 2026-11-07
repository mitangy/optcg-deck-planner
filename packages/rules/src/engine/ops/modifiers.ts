/**
 * Modifier-applying ops (power, cost, keywords, restrictions, negation, granted abilities). `power`, `cost` and `base_power` share one handler.
 */
import { addModifier, expiryFor } from "../modifiers.js";
import { basePowerOf, evalValue } from "../queries.js";
import { type Located, isOnField } from "../state.js";
import type { ExecResult } from "../vm.js";
import { type OpCtx, type OpEffect, type OpTable, durationLabel, seatOf } from "./shared.js";

/** `power`, `cost` and `base_power` differ only in the modifier they add. */
const numericBuff = (effect: OpEffect<"power" | "cost" | "base_power">, { sim, state, frame, ctx, targetsOf }: OpCtx): ExecResult => {
  const amount = evalValue(state, ctx, effect.do === "base_power" ? effect.value : effect.amount);
  for (const loc of targetsOf(effect.target)) {
    if (!loc.card || !isOnField(loc)) continue;
    const expires = expiryFor(state, frame.seat, effect.duration);
    addModifier(state, frame.seat, frame.sourceInstanceId, { kind: "card", id: loc.id }, effect.do === "power" ? { type: "power", amount } : effect.do === "cost" ? { type: "cost", amount } : { type: "base_power", value: amount }, expires);
    if (effect.do === "power") sim.events.push({ type: "power_buff_applied", seat: loc.seat, targetDefId: loc.defId, amount, duration: durationLabel(effect.duration) });
  }
  return "next";
};

export const modifiersOps: OpTable<"power" | "cost" | "base_power" | "set_power" | "set_cost" | "keyword" | "restrict" | "player_restrict" | "negate" | "swap_base_power" | "attribute" | "grant" | "play_cost_reduction"> = {
  power: numericBuff,
  cost: numericBuff,
  base_power: numericBuff,
  set_power(effect, { state, frame, ctx, targetsOf }) {
    const value = evalValue(state, ctx, effect.value);
    for (const loc of targetsOf(effect.target)) if (loc.card && isOnField(loc)) addModifier(state, frame.seat, frame.sourceInstanceId, { kind: "card", id: loc.id }, { type: "set_power", value }, expiryFor(state, frame.seat, effect.duration));
    return "next";
  },
  set_cost(effect, { state, frame, ctx, targetsOf }) {
    const value = evalValue(state, ctx, effect.value);
    for (const loc of targetsOf(effect.target)) if (loc.card && isOnField(loc)) addModifier(state, frame.seat, frame.sourceInstanceId, { kind: "card", id: loc.id }, { type: "set_cost", value }, expiryFor(state, frame.seat, effect.duration));
    return "next";
  },
  keyword(effect, { state, frame, targetsOf }) {
    for (const loc of targetsOf(effect.target)) if (loc.card && isOnField(loc)) addModifier(state, frame.seat, frame.sourceInstanceId, { kind: "card", id: loc.id }, { type: "keyword", keyword: effect.keyword }, expiryFor(state, frame.seat, effect.duration));
    return "next";
  },
  restrict(effect, { state, frame, targetsOf }) {
    for (const loc of targetsOf(effect.target)) {
      if (loc.zone === "don" && effect.restriction === "no_refresh") { const d = state.players[loc.seat].costArea.find((x) => x.id === loc.id); if (d) d.noRefresh = true; continue; }
      if (!loc.card || !isOnField(loc)) continue;
      const expires = effect.restriction === "no_refresh" ? { kind: "next_refresh" as const, seat: loc.seat } : expiryFor(state, frame.seat, effect.duration);
      addModifier(state, frame.seat, frame.sourceInstanceId, { kind: "card", id: loc.id }, { type: "restrict", restriction: effect.restriction, ...(effect.value != null ? { value: effect.value } : {}), ...(effect.attribute ? { attribute: effect.attribute } : {}), ...(effect.filter ? { filter: effect.filter } : {}) }, expires);
    }
    return "next";
  },
  player_restrict(effect, { state, frame }) {
    addModifier(state, frame.seat, frame.sourceInstanceId, { kind: "player", seat: seatOf(frame, effect.player) }, { type: "player_restrict", restriction: effect.restriction, ...(effect.filter ? { filter: effect.filter } : {}) }, expiryFor(state, frame.seat, effect.duration));
    return "next";
  },
  negate(effect, { state, frame, targetsOf }) {
    for (const loc of targetsOf(effect.target)) if (loc.card && isOnField(loc)) addModifier(state, frame.seat, frame.sourceInstanceId, { kind: "card", id: loc.id }, { type: "negate" }, expiryFor(state, frame.seat, effect.duration));
    return "next";
  },
  swap_base_power(effect, { state, frame, targetsOf }) {
    const cards = [...targetsOf(effect.target), ...(effect.with ? targetsOf(effect.with) : [])].filter((l) => l.card && isOnField(l));
    if (cards.length !== 2) return "next";
    const [a, b] = cards as [Located, Located];
    const pa = basePowerOf(state, a.seat, a.card!);
    const pb = basePowerOf(state, b.seat, b.card!);
    const expires = expiryFor(state, frame.seat, effect.duration);
    addModifier(state, frame.seat, frame.sourceInstanceId, { kind: "card", id: a.id }, { type: "base_power", value: pb }, expires);
    addModifier(state, frame.seat, frame.sourceInstanceId, { kind: "card", id: b.id }, { type: "base_power", value: pa }, expires);
    return "next";
  },
  attribute(effect, { state, frame, targetsOf }) {
    for (const loc of targetsOf(effect.target)) if (loc.card && isOnField(loc)) addModifier(state, frame.seat, frame.sourceInstanceId, { kind: "card", id: loc.id }, { type: "attribute", attribute: effect.attribute }, expiryFor(state, frame.seat, effect.duration));
    return "next";
  },
  grant(effect, { state, frame }) {
    const abilityId = `${frame.abilityId.split("#")[0]}#${effect.ability}`;
    addModifier(state, frame.seat, frame.sourceInstanceId, { kind: "player", seat: frame.seat }, { type: "granted", abilityId, sourceDefId: frame.sourceDefId }, expiryFor(state, frame.seat, effect.duration));
    return "next";
  },
  play_cost_reduction(effect, { state, frame }) {
    addModifier(state, frame.seat, frame.sourceInstanceId, { kind: "player", seat: frame.seat }, { type: "play_cost", filter: effect.filter, amount: effect.amount, ...(effect.next ? { once: true } : {}) }, expiryFor(state, frame.seat, effect.duration));
    return "next";
  },
};
