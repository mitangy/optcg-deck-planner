/**
 * Derived values and predicates. Continuous (static) abilities are evaluated
 * on demand from current state, so they update immediately when conditions,
 * sources or DON!! change.
 *
 * This module is a barrel over the concern modules: `evalCtx`, `statics`
 * (static layer and per-state query cache), `stats` (power, cost, keywords,
 * restrictions), `selectors`, `evaluate` (values and conditions) and `costs`.
 */
export { type EvalCtx, ctxFor, namesOfDef } from "./evalCtx.js";
export { type StaticEntry, activeStatics, isNegated, setQueryCacheEnabled, withQueryCache } from "./statics.js";
export {
  attackTargetAllowed, attributesOf, basePowerOf, cannotAttackMatching, costOf, counterOf, hasKeyword, hasRestriction, keywordsOf, playCostOf, playerRestricted, powerOf, protectedFromBattleKoBy, protectedFromSource, restrictionValue,
} from "./stats.js";
export { attachedDonEntries, candidates, donEntries, filterMatches, selectorMatches } from "./selectors.js";
export { evalCond, evalCount, evalValue } from "./evaluate.js";
export { canPayCost, canPayCosts, costDependsOnHiddenInfo, lifeFaceGroups, selectorReadsHiddenZone } from "./costs.js";
