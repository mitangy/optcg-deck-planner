import { abilityById, programFor, REGISTRY_HASH } from "../cards/abilities.js";
import type { MatchState } from "../types.js";
import { isValidRngState } from "../rng.js";

export const RULES_VERSION = "0.3.0";
export const MATCH_STATE_VERSION = 3 as const;
export const RULES_PROTOCOL_VERSION = 5 as const;

export class IncompatibleSnapshotError extends Error {
  constructor(message: string) { super(message); this.name = "IncompatibleSnapshotError"; }
}

export function serializeMatch(state: MatchState): string {
  validateMatchContract(state);
  return JSON.stringify(state);
}

export function deserializeMatch(snapshot: string): MatchState {
  const state = JSON.parse(snapshot) as MatchState;
  validateMatchContract(state);
  return state;
}

/** Reject snapshots from another rules/registry build or with corrupt continuations. */
export function validateMatchContract(state: MatchState): void {
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new IncompatibleSnapshotError("Snapshot must be an object");
  if (state.stateVersion !== MATCH_STATE_VERSION) throw new IncompatibleSnapshotError(`Unsupported match state version ${String(state.stateVersion)}`);
  if (state.rulesVersion !== RULES_VERSION) throw new IncompatibleSnapshotError(`Unsupported rules version ${String(state.rulesVersion)}`);
  if (state.protocolVersion !== RULES_PROTOCOL_VERSION) throw new IncompatibleSnapshotError(`Unsupported protocol version ${String(state.protocolVersion)}`);
  if (state.registryHash !== REGISTRY_HASH) throw new IncompatibleSnapshotError("Snapshot card registry does not match this rules build");
  if (!isValidRngState(state.rng)) throw new IncompatibleSnapshotError("Snapshot RNG state is invalid");
  validateContinuations(state);
}

function validateContinuations(state: MatchState): void {
  const invalid = (message: string): never => { throw new IncompatibleSnapshotError(`Snapshot continuation: ${message}`); };
  for (const key of ["resolutionFrames", "pendingChoices", "triggerQueue", "modifiers", "steps"] as const) if (!Array.isArray(state[key])) invalid(`missing ${key}`);
  const frames = new Set<string>();
  for (const frame of state.resolutionFrames) {
    if (!frame || typeof frame.id !== "string" || frames.has(frame.id)) invalid("invalid or duplicate frame ID");
    if (frame.seat !== 0 && frame.seat !== 1) invalid(`${frame.id}: invalid seat`);
    if (typeof frame.sourceInstanceId !== "string" || typeof frame.sourceDefId !== "string") invalid(`${frame.id}: missing source`);
    let length: number;
    // Engine-generated programs (not card abilities) have fixed two-instruction bodies.
    if (frame.program === "trash_for_space" || frame.program === "attack_tax") length = 2;
    else if (typeof frame.bindings._delay === "number") length = Number.MAX_SAFE_INTEGER;
    else {
      const entry = abilityById(frame.abilityId);
      if (!entry || entry.cardId !== frame.sourceDefId) invalid(`${frame.id}: unknown source ability`);
      length = frame.program === "replacement" ? Number.MAX_SAFE_INTEGER : programFor(frame.abilityId).instrs.length;
    }
    if (!Number.isSafeInteger(frame.operationIndex) || frame.operationIndex < 0 || frame.operationIndex > length) invalid(`${frame.id}: invalid instruction index`);
    if (!frame.bindings || typeof frame.bindings !== "object" || Array.isArray(frame.bindings)) invalid(`${frame.id}: invalid bindings`);
    for (const value of Object.values(frame.bindings)) {
      if (value !== null && typeof value !== "string" && typeof value !== "boolean" && !(typeof value === "number" && Number.isFinite(value)) && !(Array.isArray(value) && value.every((item) => typeof item === "string"))) invalid(`${frame.id}: nonserializable binding`);
    }
    frames.add(frame.id);
  }
  for (const choice of state.pendingChoices) {
    if (!choice || typeof choice.id !== "string") invalid("invalid choice");
    if (choice.resolutionFrameId && !frames.has(choice.resolutionFrameId)) invalid(`${choice.id}: references a missing frame`);
    if (choice.resolutionFrameId) {
      const frame = state.resolutionFrames.find((f) => f.id === choice.resolutionFrameId)!;
      if (frame.bindings._await !== choice.id) invalid(`${choice.id}: frame is not awaiting this choice`);
    }
  }
  for (const trigger of state.triggerQueue) if (!abilityById(trigger.abilityId)) invalid(`${trigger.id}: unknown queued ability`);
}
