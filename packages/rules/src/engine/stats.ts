/**
 * Derived card values: power, cost, keywords, restrictions and counters.
 */
import { getCardDef } from "../cards/definitions.js";
import type { Filter, Keyword, PlayerRestriction, Restriction } from "../effects/types.js";
import type { CardInstance, InstanceId, MatchState, Seat } from "../types.js";
import { type Located, otherSeat } from "./state.js";
import { ctxFor } from "./evalCtx.js";
import { activeStatics, cardModifiers, costStaticsFor, locateCard, staticPassActive, staticsFor } from "./statics.js";
import { filterMatches, onField } from "./selectors.js";
import { evalValue } from "./evaluate.js";

// ---------------------------------------------------------------------------
// Derived card values
// ---------------------------------------------------------------------------

export function basePowerOf(state: MatchState, seat: Seat, card: CardInstance): number {
  let p = getCardDef(card.defId).power ?? 0;
  for (const { entry, s } of staticsFor(state, seat, card)) if (s.s === "base_power") p = evalValue(state, ctxFor(entry.seat, entry.card), s.value);
  for (const m of cardModifiers(state, card)) if (m.effect.type === "base_power") p = m.effect.value;
  return p;
}

export function powerOf(state: MatchState, seat: Seat, card: CardInstance): number {
  const def = getCardDef(card.defId);
  if (def.type === "stage" || def.type === "event") return def.power ?? 0;
  let p = basePowerOf(state, seat, card);
  for (const { entry, s } of staticsFor(state, seat, card)) if (s.s === "power") p += evalValue(state, ctxFor(entry.seat, entry.card), s.amount);
  for (const m of cardModifiers(state, card)) if (m.effect.type === "power") p += m.effect.amount;
  if (state.activeSeat === seat) p += card.attachedDonIds.length * 1000;
  for (const m of cardModifiers(state, card)) if (m.effect.type === "set_power") p = m.effect.value;
  return p;
}

export function costOf(state: MatchState, seat: Seat, card: CardInstance): number {
  let c = getCardDef(card.defId).cost;
  const costStatics = staticPassActive() ? costStaticsFor(state, card) : staticsFor(state, seat, card);
  for (const { entry, s } of costStatics) if (s.s === "cost") c += evalValue(state, ctxFor(entry.seat, entry.card), s.amount);
  for (const m of cardModifiers(state, card)) if (m.effect.type === "cost") c += m.effect.amount;
  for (const m of cardModifiers(state, card)) if (m.effect.type === "set_cost") c = m.effect.value;
  return Math.max(0, c);
}

export function keywordsOf(state: MatchState, seat: Seat, card: CardInstance): Set<Keyword> {
  const out = new Set<Keyword>();
  for (const { s } of staticsFor(state, seat, card)) if (s.s === "keyword") out.add(s.keyword);
  for (const m of cardModifiers(state, card)) if (m.effect.type === "keyword") out.add(m.effect.keyword);
  return out;
}

export function hasKeyword(state: MatchState, seat: Seat, card: CardInstance, keyword: Keyword): boolean {
  return keywordsOf(state, seat, card).has(keyword);
}

export function restrictionValue(state: MatchState, seat: Seat, card: CardInstance, restriction: Restriction): number | true | null {
  let hit: number | true | null = null;
  for (const { s } of staticsFor(state, seat, card)) if (s.s === "restrict" && s.restriction === restriction) hit = s.value ?? true;
  for (const m of cardModifiers(state, card)) if (m.effect.type === "restrict" && m.effect.restriction === restriction) hit = m.effect.value ?? true;
  return hit;
}

export function hasRestriction(state: MatchState, seat: Seat, card: CardInstance, restriction: Restriction): boolean {
  return restrictionValue(state, seat, card, restriction) != null;
}

/** Player-level restriction. Filtered restrictions apply only when `card` matches the filter. */
export function playerRestricted(state: MatchState, seat: Seat, restriction: PlayerRestriction, card?: { id: InstanceId; defId: string }): boolean {
  const applies = (filter: Filter | undefined, ctxSeat: Seat) => {
    if (!filter) return true;
    if (!card) return false;
    const loc = locateCard(state, card.id) ?? { seat, zone: "hand" as const, index: 0, id: card.id, defId: card.defId };
    return loc != null && filterMatches(state, ctxFor(ctxSeat, card), filter, loc);
  };
  for (const m of state.modifiers) {
    if (m.target.kind === "player" && m.target.seat === seat && m.effect.type === "player_restrict" && m.effect.restriction === restriction && applies(m.effect.filter, m.sourceSeat)) return true;
  }
  for (const entry of activeStatics(state)) for (const s of entry.ability.statics ?? []) {
    if (s.s === "player_restrict" && s.restriction === restriction && (s.player === "you" ? entry.seat : otherSeat(entry.seat)) === seat && applies(s.filter, entry.seat)) return true;
  }
  return false;
}

/** "Your opponent cannot attack any card other than …": may `seat` attack `target`? */
export function attackTargetAllowed(state: MatchState, seat: Seat, target: CardInstance): boolean {
  const filters: { filter: Filter; seat: Seat; source: { id: InstanceId; defId: string } }[] = [];
  for (const m of state.modifiers) {
    if (m.target.kind === "player" && m.target.seat === seat && m.effect.type === "player_restrict" && m.effect.restriction === "attack_only_matching" && m.effect.filter) filters.push({ filter: m.effect.filter, seat: m.sourceSeat, source: { id: m.sourceId ?? "", defId: "" } });
  }
  for (const entry of activeStatics(state)) for (const s of entry.ability.statics ?? []) {
    if (s.s === "player_restrict" && s.restriction === "attack_only_matching" && s.filter && (s.player === "you" ? entry.seat : otherSeat(entry.seat)) === seat) filters.push({ filter: s.filter, seat: entry.seat, source: entry.card });
  }
  if (!filters.length) return true;
  const loc = locateCard(state, target.id);
  return loc != null && filters.every((f) => filterMatches(state, ctxFor(f.seat, f.source), f.filter, loc));
}

/** "This card cannot attack … matching": does a restriction forbid \`attacker\` from attacking \`target\`? */
export function cannotAttackMatching(state: MatchState, seat: Seat, attacker: CardInstance, target: CardInstance): boolean {
  const loc = locateCard(state, target.id);
  if (!loc) return false;
  for (const { entry, s } of staticsFor(state, seat, attacker)) if (s.s === "restrict" && s.restriction === "cannot_attack_matching" && s.filter && filterMatches(state, ctxFor(entry.seat, entry.card), s.filter, loc)) return true;
  for (const m of cardModifiers(state, attacker)) if (m.effect.type === "restrict" && m.effect.restriction === "cannot_attack_matching" && m.effect.filter && filterMatches(state, ctxFor(m.sourceSeat, attacker), m.effect.filter, loc)) return true;
  return false;
}

/** Printed attributes plus gained ones (field cards). */
export function attributesOf(state: MatchState, loc: Located): string[] {
  const printed = (getCardDef(loc.defId).attribute ?? "").split("/").filter(Boolean);
  if (!loc.card || !onField(loc)) return printed;
  const gained = cardModifiers(state, loc.card).flatMap((m) => (m.effect.type === "attribute" ? [m.effect.attribute] : []));
  return [...printed, ...gained];
}

/** Protection keyed on the effect's source card ("cannot be K.O.'d by effects of Characters without <Special>"). */
export function protectedFromSource(state: MatchState, target: Located, restriction: Restriction, source: Located | null, sourceSeat: Seat): boolean {
  if (!target.card || !onField(target)) return false;
  const filters: { filter: Filter; seat: Seat; card: CardInstance }[] = [];
  for (const { entry, s } of staticsFor(state, target.seat, target.card)) if (s.s === "restrict" && s.restriction === restriction && s.filter) filters.push({ filter: s.filter, seat: entry.seat, card: entry.card });
  for (const m of cardModifiers(state, target.card)) if (m.effect.type === "restrict" && m.effect.restriction === restriction && m.effect.filter) filters.push({ filter: m.effect.filter, seat: m.sourceSeat, card: target.card });
  if (!filters.length) return false;
  if (restriction !== "cannot_be_ko_by_effect_from" && sourceSeat === target.seat) return false;
  if (!source) return false;
  return filters.some((f) => filterMatches(state, ctxFor(f.seat, f.card), f.filter, source));
}

/** "Cannot be K.O.'d in battle by <Attribute> …": does any such protection apply against `attackerDefId`? */
export function protectedFromBattleKoBy(state: MatchState, seat: Seat, card: CardInstance, attackerDefId: string): boolean {
  const attackerLoc = findBattleCard(state, attackerDefId);
  const attrs = attackerLoc ? attributesOf(state, attackerLoc) : (getCardDef(attackerDefId).attribute ?? "").split("/");
  // "Cannot be K.O.'d in battle by Leaders" compiles to the `__leader` pseudo-attribute (tools/cardText/grammar/statics.ts).
  if (getCardDef(attackerDefId).type === "leader") attrs.push("__leader");
  for (const { entry, s } of staticsFor(state, seat, card)) {
    if (s.s === "restrict" && s.restriction === "cannot_be_ko_in_battle_by_attribute" && s.attribute && attrs.includes(s.attribute)) return true;
    if (s.s === "restrict" && s.restriction === "cannot_be_ko_in_battle_by" && s.filter && attackerLoc && filterMatches(state, ctxFor(entry.seat, entry.card), s.filter, attackerLoc)) return true;
  }
  for (const m of cardModifiers(state, card)) if (m.effect.type === "restrict" && m.effect.restriction === "cannot_be_ko_in_battle_by_attribute" && m.effect.attribute && attrs.includes(m.effect.attribute)) return true;
  return false;
}

/** Counter value of a hand card, including "have a +N Counter" rules. */
export function counterOf(state: MatchState, seat: Seat, card: CardInstance): number {
  const def = getCardDef(card.defId);
  let value = def.counter ?? 0;
  const loc = locateCard(state, card.id);
  for (const entry of activeStatics(state)) {
    if (entry.seat !== seat) continue;
    // Hand-zone Counter statics only change the card itself ("this card in your hand has a +N Counter").
    if (entry.zone === "hand" && entry.card.id !== card.id) continue;
    for (const s of entry.ability.statics ?? []) {
      if (s.s !== "counter") continue;
      if (s.onlyWithoutCounter && (def.counter ?? 0) > 0) continue;
      if (!loc || !filterMatches(state, ctxFor(entry.seat, entry.card), s.filter, loc)) continue;
      value = s.mode === "set" ? s.value : value + s.value;
    }
  }
  return value;
}

/** Cost to play a hand card now. */
export function playCostOf(state: MatchState, seat: Seat, card: CardInstance): number {
  const def = getCardDef(card.defId);
  let cost = def.cost;
  const loc = locateCard(state, card.id);
  for (const entry of activeStatics(state)) {
    if (entry.seat !== seat) continue;
    for (const s of entry.ability.statics ?? []) {
      if (s.s !== "play_cost") continue;
      if (s.target === "self" ? entry.card.id === card.id && entry.zone === "hand" : entry.zone === "field" && loc != null && filterMatches(state, ctxFor(entry.seat, entry.card), s.target.filter, loc)) {
        cost += evalValue(state, ctxFor(entry.seat, entry.card), s.amount);
      }
    }
  }
  for (const m of state.modifiers) {
    if (m.target.kind !== "player" || m.target.seat !== seat || m.effect.type !== "play_cost") continue;
    if (loc && filterMatches(state, ctxFor(seat, card), m.effect.filter, loc)) cost += m.effect.amount;
  }
  return Math.max(0, cost);
}

function findBattleCard(state: MatchState, defId: string): Located | null {
  const b = state.battle;
  if (!b) return null;
  const loc = locateCard(state, b.attackerId);
  return loc && loc.defId === defId ? loc : null;
}
