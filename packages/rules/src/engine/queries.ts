/**
 * Derived values and predicates. Continuous (static) abilities are evaluated
 * on demand from current state, so they update immediately when conditions,
 * sources or DON!! change.
 */
import { abilitiesFor } from "../cards/abilities.js";
import { getCardDef } from "../cards/definitions.js";
import type { Ability, CmpOp, Cond, Cost, CountExpr, Filter, Keyword, PlayerRestriction, Restriction, Selector, Static, Value } from "../effects/types.js";
import type { BindingValue, CardDef, CardInstance, InstanceId, MatchState, Seat } from "../types.js";
import { activeDon, donOnField, fieldCards, locate, otherSeat, type Located, type ZoneName } from "./state.js";

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

const relSeat = (ctx: { seat: Seat }, rel: "you" | "opponent"): Seat => (rel === "you" ? ctx.seat : otherSeat(ctx.seat));
const seatsFor = (ctx: { seat: Seat }, rel: "you" | "opponent" | "any"): Seat[] => (rel === "any" ? [ctx.seat, otherSeat(ctx.seat)] : [relSeat(ctx, rel)]);

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

// ---------------------------------------------------------------------------
// Static ability layer
// ---------------------------------------------------------------------------

export interface StaticEntry {
  seat: Seat;
  card: CardInstance;
  zone: "field" | "hand";
  ability: Ability;
}

let staticGuard = 0;

export function isNegated(state: MatchState, card: CardInstance): boolean {
  return state.modifiers.some((m) => m.target.kind === "card" && m.target.id === card.id && m.effect.type === "negate");
}

function handOnly(ability: Ability): boolean {
  return (ability.statics ?? []).every((s) => s.s === "play_cost" && s.target === "self");
}

/** Static abilities currently in effect. Re-entrant queries during condition checks see none. */
export function activeStatics(state: MatchState): StaticEntry[] {
  if (staticGuard > 0) return [];
  staticGuard += 1;
  try {
    const out: StaticEntry[] = [];
    for (const seat of [0, 1] as Seat[]) {
      const p = state.players[seat];
      for (const card of fieldCards(p)) {
        if (isNegated(state, card)) continue;
        for (const ability of abilitiesFor(card.defId)) {
          if (ability.trigger !== "static" || handOnly(ability)) continue;
          if (ability.don && card.attachedDonIds.length < ability.don) continue;
          const ctx = ctxFor(seat, card);
          if ((ability.conditions ?? []).every((c) => evalCond(state, ctx, c))) out.push({ seat, card, zone: "field", ability });
        }
      }
      for (const card of p.hand) {
        for (const ability of abilitiesFor(card.defId)) {
          if (ability.trigger !== "static" || !handOnly(ability)) continue;
          const ctx = ctxFor(seat, card);
          if ((ability.conditions ?? []).every((c) => evalCond(state, ctx, c))) out.push({ seat, card, zone: "hand", ability });
        }
      }
    }
    return out;
  } finally {
    staticGuard -= 1;
  }
}

function staticApplies(state: MatchState, entry: StaticEntry, s: Static, target: { seat: Seat; card: CardInstance }): boolean {
  if (!("target" in s)) return false;
  const t = s.target;
  if (t === "self") return entry.card.id === target.card.id;
  if (typeof t !== "object" || !("all" in t)) return false;
  const loc = locate(state, target.card.id);
  if (!loc) return false;
  return selectorMatches(state, ctxFor(entry.seat, entry.card), t.all, loc);
}

function staticsFor(state: MatchState, seat: Seat, card: CardInstance): { entry: StaticEntry; s: Static }[] {
  const out: { entry: StaticEntry; s: Static }[] = [];
  const entries = activeStatics(state);
  // Selector checks inside static targeting see printed values (no recursion).
  staticGuard += 1;
  try {
    for (const entry of entries) {
      if (entry.zone !== "field") continue;
      for (const s of entry.ability.statics ?? []) if (staticApplies(state, entry, s, { seat, card })) out.push({ entry, s });
    }
  } finally {
    staticGuard -= 1;
  }
  return out;
}

function cardModifiers(state: MatchState, card: CardInstance) {
  return state.modifiers.filter((m) => m.target.kind === "card" && m.target.id === card.id);
}

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
  return p;
}

export function costOf(state: MatchState, seat: Seat, card: CardInstance): number {
  let c = getCardDef(card.defId).cost;
  for (const { entry, s } of staticsFor(state, seat, card)) if (s.s === "cost") c += evalValue(state, ctxFor(entry.seat, entry.card), s.amount);
  for (const m of cardModifiers(state, card)) if (m.effect.type === "cost") c += m.effect.amount;
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

export function playerRestricted(state: MatchState, seat: Seat, restriction: PlayerRestriction): boolean {
  if (state.modifiers.some((m) => m.target.kind === "player" && m.target.seat === seat && m.effect.type === "player_restrict" && m.effect.restriction === restriction)) return true;
  for (const entry of activeStatics(state)) for (const s of entry.ability.statics ?? []) {
    if (s.s === "player_restrict" && s.restriction === restriction && (s.player === "you" ? entry.seat : otherSeat(entry.seat)) === seat) return true;
  }
  return false;
}

/** Counter value of a hand card, including "have a +N Counter" rules. */
export function counterOf(state: MatchState, seat: Seat, card: CardInstance): number {
  const def = getCardDef(card.defId);
  let value = def.counter ?? 0;
  const loc = locate(state, card.id);
  for (const entry of activeStatics(state)) {
    if (entry.seat !== seat || entry.zone !== "field") continue;
    for (const s of entry.ability.statics ?? []) {
      if (s.s !== "counter") continue;
      if (s.onlyWithoutCounter && (def.counter ?? 0) > 0) continue;
      if (!loc || !filterMatches(state, ctxFor(entry.seat, entry.card), s.filter, loc)) continue;
      value = s.mode === "set" ? Math.max(value, s.value) : value + s.value;
    }
  }
  return value;
}

/** Cost to play a hand card now. */
export function playCostOf(state: MatchState, seat: Seat, card: CardInstance): number {
  const def = getCardDef(card.defId);
  let cost = def.cost;
  const loc = locate(state, card.id);
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
  deck: ["deck"],
  deck_top: ["deck"],
  life: ["life"],
  resolving: ["resolving"],
  don: [],
};

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
  const out: Located[] = [];
  for (const seat of seatsFor(ctx, selector.player)) {
    for (const zone of ZONES[selector.zone] ?? []) {
      for (const loc of zoneEntries(state, seat, zone)) {
        if (!selector.filter || filterMatches(state, ctx, selector.filter, loc)) out.push(loc);
      }
    }
  }
  return out;
}

export function selectorMatches(state: MatchState, ctx: EvalCtx, selector: Selector, loc: Located): boolean {
  if (!seatsFor(ctx, selector.player).includes(loc.seat)) return false;
  if (!(ZONES[selector.zone] ?? []).includes(loc.zone)) return false;
  return !selector.filter || filterMatches(state, ctx, selector.filter, loc);
}

function cmp(op: CmpOp, a: number, b: number): boolean {
  switch (op) {
    case "<=": return a <= b;
    case ">=": return a >= b;
    case "==": return a === b;
    case "<": return a < b;
    case ">": return a > b;
    case "!=": return a !== b;
  }
}

function asList(value: BindingValue | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [value];
  return [];
}

const onField = (loc: Located) => loc.zone === "leader" || loc.zone === "character" || loc.zone === "stage";

export function filterMatches(state: MatchState, ctx: EvalCtx, f: Filter, loc: Located): boolean {
  const def: CardDef = getCardDef(loc.defId);
  if (f.types && !f.types.includes(def.type)) return false;
  if (f.traits && !f.traits.some((t) => def.traits?.includes(t))) return false;
  if (f.traitIncludes && !f.traitIncludes.some((t) => (def.traits ?? []).some((trait) => trait.includes(t)))) return false;
  if (f.notTraits && f.notTraits.some((t) => def.traits?.includes(t))) return false;
  if (f.names || f.notNames || f.nameIncludes) {
    const names = namesOfDef(loc.defId);
    if (f.names && !f.names.some((n) => names.includes(n))) return false;
    if (f.notNames && f.notNames.some((n) => names.includes(n))) return false;
    if (f.nameIncludes && !f.nameIncludes.some((n) => names.some((name) => name.includes(n)))) return false;
  }
  if (f.colors && !f.colors.some((c) => def.colors.includes(c))) return false;
  if (f.multicolor != null && (def.colors.length > 1) !== f.multicolor) return false;
  if (f.attributes && !f.attributes.some((a) => (def.attribute ?? "").split("/").includes(a))) return false;
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
  return true;
}

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
    case "don_attached_self": { const loc = locate(state, ctx.sourceId); return loc?.card?.attachedDonIds.length ?? 0; }
    case "cards": return candidates(state, ctx, expr.selector).length;
    case "var": { const v = ctx.vars[expr.name]; return typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : asList(v).length; }
    case "var_sum": return asList(ctx.vars[expr.name]).reduce((n, id) => {
      const loc = locate(state, id);
      if (!loc) return n;
      if (expr.field === "cost") return n + (loc.card && onField(loc) ? costOf(state, loc.seat, loc.card) : getCardDef(loc.defId).cost);
      return n + (loc.card && onField(loc) ? powerOf(state, loc.seat, loc.card) : getCardDef(loc.defId).power ?? 0);
    }, 0);
  }
}

export function evalValue(state: MatchState, ctx: EvalCtx, value: Value): number {
  if (typeof value === "number") return value;
  return evalCount(state, ctx, value.count) * (value.times ?? 1) + (value.plus ?? 0);
}

function sourceCard(state: MatchState, ctx: EvalCtx): CardInstance | undefined {
  return locate(state, ctx.sourceId)?.card;
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
    case "var_all_match": { const ids = asList(ctx.vars[cond.name]); return ids.length > 0 && ids.every((id) => { const loc = locate(state, id); return loc != null && filterMatches(state, ctx, cond.filter, loc); }); }
    case "var_any_match": return asList(ctx.vars[cond.name]).some((id) => { const loc = locate(state, id); return loc != null && filterMatches(state, ctx, cond.filter, loc); });
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
  }
}

// ---------------------------------------------------------------------------
// Cost payability
// ---------------------------------------------------------------------------

export function canPayCost(state: MatchState, ctx: EvalCtx, cost: Cost): boolean {
  const p = state.players[ctx.seat];
  const src = locate(state, ctx.sourceId);
  switch (cost.k) {
    case "rest_don": return activeDon(p).length >= cost.count;
    case "return_don": return donOnField(p) >= cost.count;
    case "trash_hand": case "reveal_hand": case "hand_to_deck_bottom":
      return candidates(state, ctx, { player: "you", zone: "hand", ...(cost.filter ? { filter: cost.filter } : {}) }).filter((l) => l.id !== ctx.sourceId).length >= cost.count;
    case "rest_self": return src?.card != null && onField(src) && !src.card.rested;
    case "trash_self": case "self_to_hand": case "self_to_deck_bottom": return src != null && (src.zone === "character" || src.zone === "stage");
    case "rest_cards": return candidates(state, ctx, cost.selector).filter((l) => l.card && !l.card.rested).length >= cost.count;
    case "trash_cards": case "return_cards_to_hand": case "cards_to_deck_bottom": return candidates(state, ctx, cost.selector).length >= cost.count;
    case "trash_to_deck_bottom": return candidates(state, ctx, { player: "you", zone: "trash", ...(cost.filter ? { filter: cost.filter } : {}) }).length >= cost.count;
    case "life_to_hand": case "trash_life": return p.life.length >= cost.count;
    case "life_face_down": return p.faceUpLife.filter(Boolean).length >= cost.count || p.life.length >= cost.count;
    case "life_face_up": return p.life.length >= cost.count;
    case "mill": return p.deck.length >= cost.count;
    case "power": return cost.target !== "active_leader" || !p.leader.rested;
    case "give_opponent_don": { const o = state.players[otherSeat(ctx.seat)]; return o.costArea.filter((d) => d.rested).length >= cost.count && o.characters.length > 0; }
    case "place_self_in_life": return src != null && src.zone !== "life";
  }
}

export function canPayCosts(state: MatchState, ctx: EvalCtx, costs: readonly Cost[]): boolean {
  return costs.every((c) => canPayCost(state, ctx, c));
}
