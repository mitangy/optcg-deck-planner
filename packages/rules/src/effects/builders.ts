/**
 * Concise builders for the effect DSL (`effects/types.ts`). They only assemble plain JSON objects, with the keys in a
 * fixed order, so card data written with them serialises exactly like the equivalent literal. Shared by the reviewed
 * manual abilities and the card-text grammar; the generated `abilities.json` is pinned by the regeneration test.
 */
import type { CmpOp, Cond, CountExpr, Cost, Duration, Effect, Filter, Rel, RelOrAny, Selector, Target, Value } from "./types.js";

// Comparison operators for `Filter` numeric fields ({ op, value }).
export const le = (value: Value) => ({ op: "<=" as const, value });
export const ge = (value: Value) => ({ op: ">=" as const, value });
export const eq = (value: Value) => ({ op: "==" as const, value });

// Selectors.
export const sel = (player: Selector["player"], zone: Selector["zone"], filter?: Filter, also?: Selector[]): Selector => ({ player, zone, ...(filter ? { filter } : {}), ...(also ? { also } : {}) });
export const oppChar = (filter?: Filter) => sel("opponent", "character", filter);
export const myChar = (filter?: Filter) => sel("you", "character", filter);
export const oppDon = (filter?: Filter) => sel("opponent", "don", filter);
export const oppCharOrDon = (filter?: Filter) => sel("opponent", "character", filter, [oppDon()]);
export const myLeaderOrChar = (filter?: Filter) => sel("you", "leader_or_character", filter);

// Targets.
/** Choose target with explicit bounds (`upTo`/`exactly` cover the two common shapes). */
export const choose = (min: number, max: number, selector: Selector, extra: Partial<Extract<Target, { ref: "choose" }>> = {}): Target => ({ ref: "choose", selector, min, max, ...extra });
export const leaderOf = (player: Rel): Target => ({ ref: "leader", player });
export const upTo = (max: number, selector: Selector, extra: Partial<Extract<Target, { ref: "choose" }>> = {}): Target => ({ ref: "choose", selector, min: 0, max, ...extra });
export const exactly = (n: number, selector: Selector, extra: Partial<Extract<Target, { ref: "choose" }>> = {}): Target => ({ ref: "choose", selector, min: n, max: n, ...extra });
export const v = (name: string): Target => ({ ref: "var", name });
export const self: Target = { ref: "self" };
export const myLeader: Target = { ref: "leader", player: "you" };

// Effects.
export const seq = (...steps: Effect[]): Effect => ({ do: "seq", steps });
export const when = (cond: Cond, then: Effect, otherwise?: Effect): Effect => ({ do: "if", cond, then, ...(otherwise ? { else: otherwise } : {}) });
export const may = (then: Effect, costs?: Cost[]): Effect => ({ do: "may", then, ...(costs ? { costs } : {}) });
export const oneOf = (...options: [string, Effect][]): Effect => ({ do: "choose_one", options: options.map(([label, effect]) => ({ label, effect })) });
export const select = (bind: string, selector: Selector, min: number, max: number, extra: Partial<Extract<Effect, { do: "select" }>> = {}): Effect => ({ do: "select", bind, selector, min, max, ...extra });
export const power = (target: Target, amount: Value, duration: Duration = "turn"): Effect => ({ do: "power", target, amount, duration });
export const ko = (target: Target): Effect => ({ do: "ko", target });
export const rest = (target: Target): Effect => ({ do: "rest", target });
export const play = (target: Target, rested = false): Effect => ({ do: "play", target, ...(rested ? { rested } : {}) });
export const draw = (count: Value): Effect => ({ do: "draw", player: "you", count });
export const discard = (count: Value, extra: Partial<Extract<Effect, { do: "discard" }>> = {}): Effect => ({ do: "discard", player: "you", count, ...extra });
export const addDon = (count: number, rested: boolean): Effect => ({ do: "add_don", player: "you", count, rested });
export const keyword = (target: Target, kw: Extract<Effect, { do: "keyword" }>["keyword"], duration: Duration = "turn"): Effect => ({ do: "keyword", target, keyword: kw, duration });
export const restrict = (target: Target, restriction: Extract<Effect, { do: "restrict" }>["restriction"], duration: Duration = "turn", extra: { filter?: Filter } = {}): Effect => ({ do: "restrict", target, restriction, duration, ...extra });
/** `reveal` must match the printed text ("reveal up to …"); an unrevealed look is private to its player. */
export const look = (count: number, pick: Filter | null, max: number, reveal: boolean, rest: Extract<Effect, { do: "look" }>["rest"] = "deck_bottom"): Effect => ({ do: "look", player: "you", count, picks: [{ ...(pick ? { filter: pick } : {}), min: 0, max, dest: "hand" }], rest, reveal });
// Conditions and counts.
export const exists = (selector: Selector, atLeast?: number): Cond => ({ c: "exists", selector, ...(atLeast ? { atLeast } : {}) });
export const none = (selector: Selector): Cond => ({ c: "none", selector });
export const cmp = (left: Value, op: CmpOp, right: Value): Cond => ({ c: "compare", left, op, right });
export const leaderName = (...names: string[]): Cond => ({ c: "leader_name", names });
export const leaderTrait = (...traits: string[]): Cond => ({ c: "leader_trait", traits });
export const leaderTraitIncludes = (text: string): Cond => ({ c: "leader_trait_includes", text });
export const varCount = (name: string, op: CmpOp, value: Value): Cond => ({ c: "var_count", name, op, value });
export const count = (selector: Selector): Value => ({ count: { of: "cards", selector } });
export const trashCount: Value = { count: { of: "trash", player: "you" } };
export const lifeCount: Value = { count: { of: "life", player: "you" } };
export const donField = (player: "you" | "opponent"): Value => ({ count: { of: "don_field", player } });
export const and = (...conds: Cond[]): Cond => ({ c: "and", conds });
export const or = (...conds: Cond[]): Cond => ({ c: "or", conds });
type PlayerCountKind = Extract<CountExpr, { player: Rel }>["of"];
/** A count of one player's cards in an area ("life" also accepts `"any"`: both players together). */
export function countOf(of: "life", player: RelOrAny): Value;
export function countOf(of: PlayerCountKind, player: Rel): Value;
export function countOf(of: "life" | PlayerCountKind, player: RelOrAny): Value {
  return { count: { of, player } as CountExpr };
}
