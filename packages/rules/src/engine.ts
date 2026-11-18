/**
 * Synchronous-only invariant: the engine keeps call-scoped module state (acting-effect marker, per-state query cache,
 * static/negation/cost re-entrancy guards), each set and restored in `try`/`finally` around a synchronous call, so no
 * `await` may sit inside one and two matches must not interleave on one thread mid-call.
 * The registry and program memo maps are keyed by immutable card data and are shared on purpose.
 */
export { createMatch, applyIntent, listLegalIntents, skipMulligans } from "./engine/intents.js";
export { getPlayerView, getSpectatorView, type PlayerView, projectGameEvents, projectPendingChoice, assertInvariants } from "./engine/views.js";
export { powerOf, costOf, playCostOf, counterOf, keywordsOf, hasKeyword, isNegated } from "./engine/queries.js";
export type { AttackTarget } from "./types.js";
export type { Rng } from "./rng.js";
