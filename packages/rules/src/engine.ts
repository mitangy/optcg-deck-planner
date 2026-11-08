/**
 * Engine facade (stable public API); implementation lives in `engine/`.
 *
 * Synchronous-only invariant: the engine keeps three pieces of call-scoped module state, each set and
 * restored in `try`/`finally` around a synchronous call, so no `await` may ever sit inside one of
 * them and two matches must never be interleaved on one thread mid-call:
 *  - the acting-effect marker (`engine/sim.ts` `withActing`/`actingSource`, read by `dispatchEvent` and
 *    `findReplacement` for "by your ... card's effect" checks),
 *  - the per-state query cache (`engine/statics.ts` `withQueryCache`),
 *  - the re-entrancy guards of the static / negation / cost passes (`engine/statics.ts`).
 * Every public entry point (`applyIntent`, `listLegalIntents`, the view builders) is a plain synchronous
 * function, so rooms, bot workers, replays and the analyst are each safe. The registry and program memo
 * maps are keyed by immutable card data and are shared on purpose.
 */
export { createMatch, applyIntent, listLegalIntents, skipMulligans } from "./engine/intents.js";
export { getPlayerView, getSpectatorView, type PlayerView, projectGameEvents, projectPendingChoice, assertInvariants } from "./engine/views.js";
export { powerOf, costOf, playCostOf, counterOf, keywordsOf, hasKeyword, isNegated } from "./engine/queries.js";
export type { AttackTarget } from "./types.js";
export type { Rng } from "./rng.js";
