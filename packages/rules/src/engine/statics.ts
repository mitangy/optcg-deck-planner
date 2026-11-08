/**
 * Static ability layer: which continuous abilities are active, what they apply to, and the per-state query cache.
 */
import { abilitiesFor } from "../cards/abilities.js";
import type { Ability, Cond, Static } from "../effects/types.js";
import type { CardInstance, InstanceId, MatchState, Modifier, Seat } from "../types.js";
import { type Located, fieldCards, locate } from "./zones.js";
import { ctxFor } from "./evalCtx.js";
import { selectorMatches } from "./selectors.js";
import { evalCond } from "./evaluate.js";

// ---------------------------------------------------------------------------
// Static ability layer
// ---------------------------------------------------------------------------

export interface StaticEntry {
  seat: Seat;
  card: CardInstance;
  zone: "field" | "hand";
  ability: Ability;
}

// Call-scoped module state (query cache below, and the static / negate / cost re-entrancy guards): all of
// it is entered and left inside one synchronous call (`try`/`finally`), so it never outlives a call and
// never crosses an `await`. The guards are recursion breakers that must also hold for uncached calls and
// across nested queries, so a per-call context would have to be threaded through every query function;
// they stay module-level (see the synchronous-only invariant documented in `engine.ts`).
let staticGuard = 0;

/** True while the general static pass is resolving (cost lookups then use the cost-only pass). */
export function staticPassActive(): boolean {
  return staticGuard > 0;
}

// ---------------------------------------------------------------------------
// Per-state query cache
// ---------------------------------------------------------------------------

/**
 * Memo of static-ability results for one state object, active only inside
 * `withQueryCache`. Queries are otherwise recomputed from scratch because the
 * engine mutates its working state while resolving an intent. Static results
 * depend on the re-entrancy guards (nested queries see fewer statics), so only
 * top-level queries, made with no guard raised, read or fill those entries.
 */
interface QueryCache {
  state: MatchState;
  activeStatics: StaticEntry[] | null;
  negated: Map<InstanceId, boolean>;
  staticsFor: Map<string, { entry: StaticEntry; s: Static }[]>;
  cardModifiers: Map<InstanceId, Modifier[]> | null;
  located: Map<InstanceId, Located | null>;
}

let queryCache: QueryCache | null = null;
let queryCacheEnabled = true;

/** Turns `withQueryCache` into a plain call (for equivalence tests and the benchmark baseline). */
export function setQueryCacheEnabled(enabled: boolean): void {
  queryCacheEnabled = enabled;
}

/**
 * Runs `fn` with derived static-ability results memoized for `state`. The state
 * must not be mutated while `fn` runs; read-only work such as building views
 * and listing legal intents qualifies. The cache is dropped when `fn` returns.
 */
export function withQueryCache<T>(state: MatchState, fn: () => T): T {
  if (!queryCacheEnabled || queryCache?.state === state) return fn();
  const outer = queryCache;
  queryCache = { state, activeStatics: null, negated: new Map(), staticsFor: new Map(), cardModifiers: null, located: new Map() };
  try {
    return fn();
  } finally {
    queryCache = outer;
  }
}

function cacheOf(state: MatchState): QueryCache | null {
  return queryCache !== null && queryCache.state === state ? queryCache : null;
}

/** The cache for static-ability results: only queries made with no re-entrancy guard raised use it. */
function topLevelCacheOf(state: MatchState): QueryCache | null {
  return staticGuard === 0 && negateGuard === 0 && costGuard === 0 ? cacheOf(state) : null;
}

/** `locate` memoized while a query cache is active. Callers must not mutate the result. */
export function locateCard(state: MatchState, id: InstanceId): Located | null {
  const cache = cacheOf(state);
  if (!cache) return locate(state, id);
  let hit = cache.located.get(id);
  if (hit === undefined) cache.located.set(id, (hit = locate(state, id)));
  return hit;
}

// Static abilities per card definition. The ability registry is frozen, so these never go stale.
const staticAbilityCache = new Map<string, { field: readonly Ability[]; hand: readonly Ability[]; negate: readonly Ability[]; cost: readonly Ability[] }>();
function staticAbilitiesOf(defId: string) {
  let hit = staticAbilityCache.get(defId);
  if (!hit) {
    const statics = abilitiesFor(defId).filter((a) => a.trigger === "static");
    hit = {
      field: statics.filter((a) => !handOnly(a)),
      hand: statics.filter((a) => handOnly(a)),
      negate: statics.filter((a) => (a.statics ?? []).some((s) => s.s === "negate")),
      cost: statics.filter((a) => (a.statics ?? []).some((s) => s.s === "cost")),
    };
    staticAbilityCache.set(defId, hit);
  }
  return hit;
}

let negateGuard = 0;
export function isNegated(state: MatchState, card: CardInstance): boolean {
  if (cardModifiers(state, card).some((m) => m.effect.type === "negate")) return true;
  // Static "… have their effects negated" (the negating card's own negation is not re-checked).
  if (negateGuard > 0) return false;
  const cache = topLevelCacheOf(state);
  if (!cache) return negatedByStatic(state, card);
  let hit = cache.negated.get(card.id);
  if (hit === undefined) cache.negated.set(card.id, (hit = negatedByStatic(state, card)));
  return hit;
}

function negatedByStatic(state: MatchState, card: CardInstance): boolean {
  negateGuard += 1;
  try {
    const loc = locateCard(state, card.id);
    if (!loc) return false;
    for (const seat of [0, 1] as Seat[]) for (const src of fieldCards(state.players[seat])) {
      for (const ability of staticAbilitiesOf(src.defId).negate) {
        for (const s of ability.statics ?? []) {
          if (s.s !== "negate") continue;
          if (s.target === "self" ? src.id !== card.id : !selectorMatches(state, ctxFor(seat, src), s.target.all, loc)) continue;
          if ((ability.conditions ?? []).every((c) => evalCond(state, ctxFor(seat, src), c))) return true;
        }
      }
    }
    return false;
  } finally {
    negateGuard -= 1;
  }
}

function handOnly(ability: Ability): boolean {
  return (ability.statics ?? []).every((s) => (s.s === "play_cost" && s.target === "self") || (s.s === "counter" && s.filter.onlySelf === true));
}

/** Static abilities currently in effect. Re-entrant queries during condition checks see none. */
export function activeStatics(state: MatchState): StaticEntry[] {
  if (staticGuard > 0) return [];
  const cache = topLevelCacheOf(state);
  if (!cache) return computeActiveStatics(state);
  return (cache.activeStatics ??= computeActiveStatics(state));
}

function computeActiveStatics(state: MatchState): StaticEntry[] {
  staticGuard += 1;
  try {
    const out: StaticEntry[] = [];
    for (const seat of [0, 1] as Seat[]) {
      const p = state.players[seat];
      for (const card of fieldCards(p)) {
        const abilities = staticAbilitiesOf(card.defId).field;
        if (abilities.length === 0 || isNegated(state, card)) continue;
        for (const ability of abilities) {
          if (ability.don && card.attachedDonIds.length < ability.don) continue;
          const ctx = ctxFor(seat, card);
          if ((ability.conditions ?? []).every((c) => evalCond(state, ctx, c))) out.push({ seat, card, zone: "field", ability });
        }
      }
      for (const card of p.hand) {
        for (const ability of staticAbilitiesOf(card.defId).hand) {
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
  const loc = locateCard(state, target.card.id);
  if (!loc) return false;
  return selectorMatches(state, ctxFor(entry.seat, entry.card), t.all, loc);
}

export function staticsFor(state: MatchState, seat: Seat, card: CardInstance): { entry: StaticEntry; s: Static }[] {
  const cache = topLevelCacheOf(state);
  if (!cache) return computeStaticsFor(state, seat, card);
  const key = `${seat}|${card.id}`;
  let hit = cache.staticsFor.get(key);
  if (!hit) cache.staticsFor.set(key, (hit = computeStaticsFor(state, seat, card)));
  return hit;
}

function computeStaticsFor(state: MatchState, seat: Seat, card: CardInstance): { entry: StaticEntry; s: Static }[] {
  const out: { entry: StaticEntry; s: Static }[] = [];
  const entries = activeStatics(state);
  // Selector checks inside static targeting see printed values (no recursion).
  staticGuard += 1;
  try {
    for (const entry of entries) {
      if (entry.zone !== "field") continue;
      for (const s of entry.ability.statics ?? []) {
      const when = (s as { when?: Cond[] }).when;
      if (when && !when.every((c) => evalCond(state, ctxFor(entry.seat, entry.card), c))) continue;
      if (staticApplies(state, entry, s, { seat, card })) out.push({ entry, s });
    }
    }
  } finally {
    staticGuard -= 1;
  }
  return out;
}

const NO_MODIFIERS: readonly Modifier[] = [];
export function cardModifiers(state: MatchState, card: CardInstance): readonly Modifier[] {
  const cache = cacheOf(state);
  if (!cache) return state.modifiers.filter((m) => m.target.kind === "card" && m.target.id === card.id);
  if (!cache.cardModifiers) {
    cache.cardModifiers = new Map();
    for (const m of state.modifiers) {
      if (m.target.kind !== "card") continue;
      const list = cache.cardModifiers.get(m.target.id);
      if (list) list.push(m);
      else cache.cardModifiers.set(m.target.id, [m]);
    }
  }
  return cache.cardModifiers.get(card.id) ?? NO_MODIFIERS;
}

/**
 * Cost statics that apply to `card`, resolved without the general static pass. Condition checks made while
 * statics are being resolved ("if there is a Character with a cost of 12 or more") still need to see +cost
 * statics such as [Loki]'s, but must not recurse into other statics; nested cost lookups see printed cost.
 */
let costGuard = 0;
export function costStaticsFor(state: MatchState, card: CardInstance): { entry: StaticEntry; s: Static }[] {
  if (costGuard > 0) return [];
  costGuard += 1;
  try {
    const out: { entry: StaticEntry; s: Static }[] = [];
    for (const seat of [0, 1] as Seat[]) for (const src of fieldCards(state.players[seat])) {
      for (const ability of staticAbilitiesOf(src.defId).cost) {
        if (ability.don && src.attachedDonIds.length < ability.don) continue;
        if (isNegated(state, src)) continue;
        const ctx = ctxFor(seat, src);
        if (!(ability.conditions ?? []).every((c) => evalCond(state, ctx, c))) continue;
        const entry: StaticEntry = { seat, card: src, zone: "field", ability };
        for (const s of ability.statics ?? []) {
          if (s.s !== "cost") continue;
          const when = (s as { when?: Cond[] }).when;
          if (when && !when.every((c) => evalCond(state, ctx, c))) continue;
          if (staticApplies(state, entry, s, { seat: entry.seat, card })) out.push({ entry, s });
        }
      }
    }
    return out;
  } finally {
    costGuard -= 1;
  }
}
