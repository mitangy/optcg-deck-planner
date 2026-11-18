export { type Sim, actingSource, turnLog } from "./sim.js";
export { abilityGateOpen, dispatchEvent, markUsed, newBatch, queueWindow, resolveGateOpen, startAbility, type EventInfo } from "./triggers.js";
export { beginPlay, finishPlay, performKo, takeLifeToHand, type RemovalCause } from "./zoneActions.js";
export { runFrames } from "./vm.js";
export { findDamageReplacement, findReplacement, pushReplacementFrame } from "./replacement.js";
export { defaultAnswer, resolveEffectChoice, type ChoiceAnswer } from "./choices.js";
export type { QueuedTrigger } from "../types.js";
