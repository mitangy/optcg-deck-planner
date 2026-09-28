/** Engine facade (stable public API); implementation lives in `engine/`. */
export { createMatch, applyIntent, listLegalIntents, skipMulligans } from "./engine/intents.js";
export { getPlayerView, getSpectatorView, projectGameEvents, projectPendingChoice, assertInvariants } from "./engine/views.js";
export { powerOf, costOf, playCostOf, counterOf, keywordsOf, hasKeyword, isNegated } from "./engine/queries.js";
export type { AttackTarget } from "./types.js";
export type { Rng } from "./rng.js";
