import type { AbilityOperation, CompiledAbilityRegistry } from "../registry/schema.js";
import type { MatchState, ResolutionFrame } from "../types.js";

export interface ProgramHost {
  alloc(prefix: string): string;
  /** A paused operation advances only after its choice is resolved. */
  execute(operation: AbilityOperation, frame: ResolutionFrame): "complete" | "paused" | { error: string };
}

/** Resume one serializable call chain; unrelated pending resolutions stay queued. */
export function resumeProgram(state: MatchState, frameId: string, registry: CompiledAbilityRegistry, host: ProgramHost): string | null {
  let currentId = frameId;
  while (true) {
    if (state.phase === "game_over" || state.winner !== null) {
      state.resolutionFrames = [];
      state.pendingChoices = [];
      return null;
    }
    const index = state.resolutionFrames.findIndex((frame) => frame.id === currentId);
    const frame = state.resolutionFrames[index];
    if (!frame) return "Ability continuation is missing";
    const ability = registry.abilities.get(frame.abilityId);
    if (!ability) return `Ability ${frame.abilityId} is unavailable`;
    if (!Number.isInteger(frame.operationIndex) || frame.operationIndex < 0 || frame.operationIndex > ability.operations.length) return "Invalid ability continuation position";
    if (frame.operationIndex === ability.operations.length) {
      const parent = frame.bindings.parentFrameId;
      state.resolutionFrames.splice(index, 1);
      if (typeof parent !== "string") return null;
      currentId = parent;
      continue;
    }
    const operation = ability.operations[frame.operationIndex]!;
    if (operation.type === "invoke_ability") {
      const childId = host.alloc("frame");
      frame.operationIndex += 1;
      state.resolutionFrames.push({
        id: childId, seat: frame.seat, sourceInstanceId: frame.sourceInstanceId,
        sourceDefId: frame.sourceDefId, abilityId: operation.abilityId,
        window: frame.window, operationIndex: 0,
        bindings: { parentFrameId: frame.id, targetId: frame.bindings.targetId ?? null },
      });
      currentId = childId;
      continue;
    }
    const result = host.execute(operation, frame);
    if (result === "paused") return null;
    if (result !== "complete") return result.error;
    frame.operationIndex += 1;
  }
}
