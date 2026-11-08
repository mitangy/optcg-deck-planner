/**
 * Ability runtime barrel. The runtime is split by concern: `sim` (shared
 * handle and acting-source marker), `triggers` (dispatch and gates),
 * `zoneActions` (K.O., play, life), `vm` (resumable instruction VM),
 * `replacement`, `ops` (leaf effect actions), `choices` (answering pending
 * choices) and `donLocation` (DON!! pseudo-locations). All state lives in
 * `MatchState` (frames, queue, modifiers, pending choices) as plain JSON.
 */
export { type Sim, actingSource, turnLog } from "./sim.js";
export { abilityGateOpen, dispatchEvent, markUsed, newBatch, queueWindow, resolveGateOpen, startAbility, type EventInfo } from "./triggers.js";
export { beginPlay, finishPlay, performKo, takeLifeToHand, type RemovalCause } from "./zoneActions.js";
export { runFrames } from "./vm.js";
export { findDamageReplacement, findReplacement, pushReplacementFrame } from "./replacement.js";
export { defaultAnswer, resolveEffectChoice, type ChoiceAnswer } from "./choices.js";
export type { QueuedTrigger } from "../types.js";
