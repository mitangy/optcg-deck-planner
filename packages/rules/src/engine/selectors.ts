/**
 * Selectors and filters: candidate cards and filter matching.
 */
import { getCardDef } from "../cards/definitions.js";
import type { CmpOp, Filter, Selector } from "../effects/types.js";
import type { BindingValue, CardDef, MatchState, Seat } from "../types.js";
import type { Located, LocatedZone, ZoneName } from "./zones.js";
import { type EvalCtx, namesOfDef, seatsFor } from "./evalCtx.js";
import { locateCard } from "./statics.js";
import { attributesOf, basePowerOf, costOf, counterOf, hasKeyword, powerOf } from "./stats.js";
import { evalValue } from "./evaluate.js";

// ---------------------------------------------------------------------------
// Selectors and filters
// ---------------------------------------------------------------------------

const ZONES: Record<string, ZoneName[]> = {
  leader: ["leader"],
  character: ["character"],
  leader_or_character: ["leader", "character"],
  stage: ["stage"],
  field: ["leader", "character", "stage"],
  hand: ["hand"],
  trash: ["trash"],
  hand_or_trash: ["hand", "trash"],
  deck_or_trash: ["deck", "trash"],
  deck: ["deck"],
  deck_top: ["deck"],
  life: ["life"],
  resolving: ["resolving"],
  don: [],
  don_field: [],
};

/** DON!! cards in the cost area as pseudo-locations (zone "don", defId "DON"). */
export function donEntries(state: MatchState, seat: Seat): Located[] {
  return state.players[seat].costArea.map((d, index) => ({ seat, zone: "don", index, id: d.id, defId: "DON" }));
}

/** DON!! attached to Leader / Characters, as "don" pseudo-locations after the cost area. */
export function attachedDonEntries(state: MatchState, seat: Seat): Located[] {
  const p = state.players[seat];
  return p.attachedDons.map((d, i) => ({ seat, zone: "don", index: p.costArea.length + i, id: d.id, defId: "DON" }));
}

function zoneEntries(state: MatchState, seat: Seat, zone: ZoneName): Located[] {
  const p = state.players[seat];
  switch (zone) {
    case "leader": return [{ seat, zone, index: 0, id: p.leader.id, defId: p.leader.defId, card: p.leader }];
    case "character": return p.characters.map((card, index) => ({ seat, zone, index, id: card.id, defId: card.defId, card }));
    case "stage": return p.stage ? [{ seat, zone, index: 0, id: p.stage.id, defId: p.stage.defId, card: p.stage }] : [];
    case "hand": return p.hand.map((card, index) => ({ seat, zone, index, id: card.id, defId: card.defId, card }));
    case "resolving": return p.resolving.map((card, index) => ({ seat, zone, index, id: card.id, defId: card.defId, card }));
    case "deck": case "trash": case "life": return p[zone].map((defId, index) => ({ seat, zone, index, id: p.zoneInstanceIds[zone][index]!, defId }));
  }
}

export function candidates(state: MatchState, ctx: EvalCtx, selector: Selector): Located[] {
  if (selector.also?.length) {
    const seen = new Set<string>();
    const out: Located[] = [];
    for (const s of [{ ...selector, also: undefined }, ...selector.also]) for (const loc of candidates(state, ctx, s)) if (!seen.has(loc.id)) { seen.add(loc.id); out.push(loc); }
    return out;
  }
  const out: Located[] = [];
  for (const seat of seatsFor(ctx, selector.player)) {
    if (selector.zone === "don") {
      for (const loc of donEntries(state, seat)) {
        const rested = state.players[seat].costArea[loc.index]!.rested;
        if (selector.filter?.rested == null || selector.filter.rested === rested) out.push(loc);
      }
      continue;
    }
    if (selector.zone === "don_field") {
      out.push(...donEntries(state, seat), ...attachedDonEntries(state, seat));
      continue;
    }
    for (const zone of ZONES[selector.zone] ?? []) {
      for (const loc of zoneEntries(state, seat, zone)) {
        if (!selector.filter || filterMatches(state, ctx, selector.filter, loc)) out.push(loc);
      }
    }
  }
  return out;
}

export function selectorMatches(state: MatchState, ctx: EvalCtx, selector: Selector, loc: Located): boolean {
  if (selector.also?.some((s) => selectorMatches(state, ctx, s, loc))) return true;
  if (!seatsFor(ctx, selector.player).includes(loc.seat)) return false;
  const zones: readonly LocatedZone[] = ZONES[selector.zone] ?? [];
  if (!zones.includes(loc.zone)) return false;
  return !selector.filter || filterMatches(state, ctx, selector.filter, loc);
}

export function cmp(op: CmpOp, a: number, b: number): boolean {
  switch (op) {
    case "<=": return a <= b;
    case ">=": return a >= b;
    case "==": return a === b;
    case "<": return a < b;
    case ">": return a > b;
    case "!=": return a !== b;
  }
}

export function asList(value: BindingValue | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [value];
  return [];
}

export const onField = (loc: Located) => loc.zone === "leader" || loc.zone === "character" || loc.zone === "stage";

export function filterMatches(state: MatchState, ctx: EvalCtx, f: Filter, loc: Located): boolean {
  const def: CardDef = getCardDef(loc.defId);
  if (f.types && !f.types.includes(def.type)) return false;
  if (f.traits && !f.traits.some((t) => def.traits?.includes(t))) return false;
  if (f.traitIncludes && !f.traitIncludes.some((t) => (def.traits ?? []).some((trait) => trait.includes(t)))) return false;
  if (f.notTraits && f.notTraits.some((t) => def.traits?.includes(t))) return false;
  if (f.notTraitIncludes && f.notTraitIncludes.some((t) => (def.traits ?? []).some((trait) => trait.includes(t)))) return false;
  if (f.vanilla != null && (!def.effectText || def.effectText === "—") !== f.vanilla) return false;
  if (f.textIncludes || f.textExcludes) {
    const text = `${def.effectText ?? ""} ${def.triggerText ?? ""}`;
    if (f.textIncludes && !f.textIncludes.every((t) => text.includes(t))) return false;
    if (f.textExcludes && f.textExcludes.some((t) => text.includes(t))) return false;
  }
  if (f.names || f.notNames || f.nameIncludes) {
    const names = namesOfDef(loc.defId);
    if (f.names && !f.names.some((n) => names.includes(n))) return false;
    if (f.notNames && f.notNames.some((n) => names.includes(n))) return false;
    if (f.nameIncludes && !f.nameIncludes.some((n) => names.some((name) => name.includes(n)))) return false;
  }
  if (f.colors && !f.colors.some((c) => def.colors.includes(c))) return false;
  if (f.multicolor != null && (def.colors.length > 1) !== f.multicolor) return false;
  if (f.attributes || f.notAttributes) {
    const attrs = attributesOf(state, loc);
    if (f.attributes && !f.attributes.some((a) => attrs.includes(a))) return false;
    if (f.notAttributes && f.notAttributes.some((a) => attrs.includes(a))) return false;
  }
  if (f.onlySelf && loc.id !== ctx.sourceId) return false;
  if (f.notColorsOfVar) {
    const colors = new Set(asList(ctx.vars[f.notColorsOfVar]).flatMap((id) => { const l = locateCard(state, id); return l ? getCardDef(l.defId).colors : []; }));
    if (def.colors.some((c) => colors.has(c))) return false;
  }
  if (f.sameNameAsVar) {
    const names = new Set(asList(ctx.vars[f.sameNameAsVar]).flatMap((id) => { const l = locateCard(state, id); return l ? [getCardDef(l.defId).name] : []; }));
    if (!names.has(def.name)) return false;
  }
  const card = loc.card;
  const field = onField(loc) && card != null;
  if (f.cost) { const v = field ? costOf(state, loc.seat, card!) : def.cost; if (!cmp(f.cost.op, v, evalValue(state, ctx, f.cost.value))) return false; }
  if (f.baseCost && !cmp(f.baseCost.op, def.cost, evalValue(state, ctx, f.baseCost.value))) return false;
  if (f.power) { const v = field ? powerOf(state, loc.seat, card!) : def.power ?? 0; if (!cmp(f.power.op, v, evalValue(state, ctx, f.power.value))) return false; }
  if (f.basePower) { const v = field ? basePowerOf(state, loc.seat, card!) : def.power ?? 0; if (!cmp(f.basePower.op, v, evalValue(state, ctx, f.basePower.value))) return false; }
  if (f.counter) { const v = loc.zone === "hand" && card ? counterOf(state, loc.seat, card) : def.counter ?? 0; if (!cmp(f.counter.op, v, evalValue(state, ctx, f.counter.value))) return false; }
  if (f.hasCounter != null && ((def.counter ?? 0) > 0) !== f.hasCounter) return false;
  if (f.hasTrigger != null && Boolean(def.hasTrigger) !== f.hasTrigger) return false;
  if (f.rested != null && (!field || card!.rested !== f.rested)) return false;
  if (f.keyword && (!field || !hasKeyword(state, loc.seat, card!, f.keyword))) return false;
  if (f.playedThisTurn != null && (!field || (card!.playedTurn === state.turnNumber) !== f.playedThisTurn)) return false;
  if (f.excludeSelf && loc.id === ctx.sourceId) return false;
  if (f.excludeVar && asList(ctx.vars[f.excludeVar]).includes(loc.id)) return false;
  if (f.inVar && !asList(ctx.vars[f.inVar]).includes(loc.id)) return false;
  if (f.faceUp != null && (loc.zone !== "life" || Boolean(state.players[loc.seat].faceUpLife[loc.index]) !== f.faceUp)) return false;
  if (f.any && !f.any.some((sub) => filterMatches(state, ctx, sub, loc))) return false;
  if (f.all && !f.all.every((sub) => filterMatches(state, ctx, sub, loc))) return false;
  if (f.donGiven && !cmp(f.donGiven.op, card?.attachedDonIds.length ?? 0, evalValue(state, ctx, f.donGiven.value))) return false;
  if (f.costEqDonGiven != null && (!field || (costOf(state, loc.seat, card!) === card!.attachedDonIds.length) !== f.costEqDonGiven)) return false;
  return true;
}
