/**
 * Sentence grammar: protected card text → DSL effects, conditions, costs and statics.
 * Every parser returns null unless it consumes its entire input.
 * Split by concern; each module keeps its rules in first-match-wins order.
 */
export { clean, parseDuration, toTarget } from "./shared.js";
export { parseCondition } from "./conditions.js";
export { parseCosts } from "./costs.js";
export { applyRestSentence, parseConditionalClause, parseEffectBody, parseEffectClause, parseStatement, restPlacement } from "./effects.js";
export { parseStaticSentence } from "./statics.js";
export type { Filter, Restriction, Selector, Value } from "../../../effects/types.js";
