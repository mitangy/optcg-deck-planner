import { ABILITY_REGISTRY } from "../registry/searchSlice.js";
import type { MatchState } from "../types.js";
import { isValidRngState } from "../rng.js";

export const RULES_VERSION = "0.2.1";
export const MATCH_STATE_VERSION = 2 as const;
export const RULES_PROTOCOL_VERSION = 4 as const;
export class IncompatibleSnapshotError extends Error { constructor(message: string) { super(message); this.name = "IncompatibleSnapshotError"; } }
export function serializeMatch(state: MatchState): string { validateMatchContract(state); return JSON.stringify(state); }
export function deserializeMatch(snapshot: string): MatchState { const state = JSON.parse(snapshot) as MatchState; validateMatchContract(state); return state; }
export function validateMatchContract(state: MatchState): void {
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new IncompatibleSnapshotError("Snapshot must be an object");
  if (state.stateVersion !== MATCH_STATE_VERSION) throw new IncompatibleSnapshotError(`Unsupported match state version ${String(state.stateVersion)}`);
  if (state.rulesVersion !== RULES_VERSION) throw new IncompatibleSnapshotError(`Unsupported rules version ${String(state.rulesVersion)}`);
  if (state.protocolVersion !== RULES_PROTOCOL_VERSION) throw new IncompatibleSnapshotError(`Unsupported protocol version ${String(state.protocolVersion)}`);
  if (state.registryHash !== ABILITY_REGISTRY.contentHash) throw new IncompatibleSnapshotError("Snapshot card registry does not match this rules build");
  if (!isValidRngState(state.rng)) throw new IncompatibleSnapshotError("Snapshot RNG state is invalid");
  validateContinuations(state);
}

function validateContinuations(state: MatchState): void {
  const invalid = (message: string): never => { throw new IncompatibleSnapshotError(`Snapshot continuation: ${message}`); };
  if (!Array.isArray(state.resolutionFrames) || !Array.isArray(state.pendingChoices)) invalid("missing frame or choice array");
  const frames = new Map<string, MatchState["resolutionFrames"][number]>();
  for (const frame of state.resolutionFrames) {
    if (!frame || typeof frame.id !== "string" || !frame.id || frames.has(frame.id)) invalid("invalid or duplicate frame ID");
    if (frame.seat !== 0 && frame.seat !== 1) invalid(`${frame.id}: invalid seat`);
    if (typeof frame.sourceInstanceId !== "string" || !frame.sourceInstanceId || typeof frame.sourceDefId !== "string") invalid(`${frame.id}: missing source`);
    const ability = ABILITY_REGISTRY.abilities.get(frame.abilityId);
    if (!ability || !ABILITY_REGISTRY.cards.get(frame.sourceDefId)?.abilities.includes(ability)) invalid(`${frame.id}: unknown source ability`);
    if (!Number.isSafeInteger(frame.operationIndex) || frame.operationIndex < 0 || frame.operationIndex > ability!.operations.length) invalid(`${frame.id}: invalid operation index`);
    if (!frame.bindings || typeof frame.bindings !== "object" || Array.isArray(frame.bindings)) invalid(`${frame.id}: invalid bindings`);
    for (const value of Object.values(frame.bindings)) {
      if (value !== null && typeof value !== "string" && typeof value !== "boolean" && !(typeof value === "number" && Number.isFinite(value)) && !(Array.isArray(value) && value.every((item) => typeof item === "string"))) invalid(`${frame.id}: nonserializable binding`);
    }
    frames.set(frame.id, frame);
  }
  const children = new Set<string>();
  for (const frame of frames.values()) {
    const parentId = frame.bindings.parentFrameId;
    if (parentId == null) continue;
    if (typeof parentId !== "string") invalid(`${frame.id}: invalid parent reference`);
    const parent = frames.get(parentId as string);
    if (!parent || parent.id === frame.id || children.has(parent.id)) invalid(`${frame.id}: missing, cyclic, or duplicated parent`);
    if (parent!.seat !== frame.seat || parent!.sourceInstanceId !== frame.sourceInstanceId || parent!.sourceDefId !== frame.sourceDefId) invalid(`${frame.id}: parent source mismatch`);
    const invocation = ABILITY_REGISTRY.abilities.get(parent!.abilityId)!.operations[parent!.operationIndex - 1];
    if (invocation?.type !== "invoke_ability" || invocation.abilityId !== frame.abilityId) invalid(`${frame.id}: parent is not awaiting this invocation`);
    children.add(parent!.id);
    const visited = new Set([frame.id]);
    let ancestor = parent;
    while (ancestor) {
      if (visited.has(ancestor.id)) invalid(`${frame.id}: cyclic parent chain`);
      visited.add(ancestor.id);
      const nextParent = ancestor.bindings.parentFrameId;
      ancestor = typeof nextParent === "string" ? frames.get(nextParent) : undefined;
    }
  }
  const waiting = new Set<string>();
  const visitChoices = (choices: MatchState["pendingChoices"], depth = 0): void => {
    if (depth > 64) invalid("choice nesting limit exceeded");
    for (const choice of choices) {
      if (!choice || typeof choice !== "object") invalid("invalid choice");
      if (choice.unorderedChoices) {
        if (!Array.isArray(choice.unorderedChoices)) invalid("invalid unordered choices");
        visitChoices(choice.unorderedChoices, depth + 1);
      }
      if (!choice.resolutionFrameId) continue;
      const frame = frames.get(choice.resolutionFrameId);
      if (!frame || waiting.has(frame.id) || children.has(frame.id)) invalid("choice references a missing or already occupied frame");
      if (frame!.seat !== choice.seat || frame!.sourceDefId !== choice.cardDefId) invalid("choice source mismatch");
      if (choice.kind === "search_top_deck") {
        const operation = ABILITY_REGISTRY.abilities.get(frame!.abilityId)!.operations[frame!.operationIndex];
        const { expectedTop, expectedInstanceIds } = frame!.bindings;
        if (operation?.type !== "search_top_deck" || !choice.search || !Array.isArray(choice.search.options) || !Array.isArray(expectedTop) || !Array.isArray(expectedInstanceIds) || expectedTop.length !== expectedInstanceIds.length || expectedTop.length !== choice.search.options.length) invalid("invalid paused search");
      }
      waiting.add(frame!.id);
    }
  };
  visitChoices(state.pendingChoices);
  for (const id of frames.keys()) if (!children.has(id) && !waiting.has(id)) invalid(`${id}: orphaned frame`);
}
