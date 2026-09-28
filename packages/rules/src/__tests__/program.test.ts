import { describe, expect, it } from "vitest";
import { createMatch } from "../index.js";
import { compileAbilityRegistry } from "../registry/compiler.js";
import type { AbilityOperation } from "../registry/schema.js";
import { resumeProgram } from "../runtime/program.js";
import { resolveDeclarativeSearch, scheduleDeclarativeSearch } from "../runtime/search.js";
import type { MatchState } from "../types.js";

const search: AbilityOperation = { type: "search_top_deck", count: 2, maxSelect: 1, destination: "hand", remainder: "deck_bottom" };
const attach = (count: number): AbilityOperation => ({ type: "attach_rested_don", count, target: "intent_target", optional: true });
const registry = compileAbilityRegistry([{ cardDefId: "TEST", abilities: [
  { schemaVersion: 1, id: "parent", kind: "triggered", zones: ["character"], windows: ["on_play"], conditions: [], costs: [], operations: [attach(1), { type: "invoke_ability", abilityId: "child" }, search, attach(4)], implementation: "implemented", testRefs: [] },
  { schemaVersion: 1, id: "child", kind: "triggered", zones: ["character"], windows: ["on_play"], conditions: [], costs: [], operations: [search, attach(2), search, attach(3)], implementation: "implemented", testRefs: [] },
] }]);
function initial() {
  const deck = Array.from({ length: 20 }, () => "ST01-003");
  const state = createMatch({ seed: 5, firstSeat: 0, players: [{ leaderId: "ST01-001", deck }, { leaderId: "ST01-001", deck: [...deck] }] });
  state.resolutionFrames.push({ id: "root", seat: 0, sourceInstanceId: "source", sourceDefId: "TEST", abilityId: "parent", window: "on_play", operationIndex: 0, bindings: { targetId: "target" } });
  return state;
}
function run(state: MatchState, frameId: string, log: number[]) {
  return resumeProgram(state, frameId, registry, {
    alloc: (prefix) => `${prefix}_${state.nextId++}`,
    execute: (operation, frame) => {
      if (operation.type === "search_top_deck") {
        state.pendingChoices.push(scheduleDeclarativeSearch(state, 0, { id: "source", defId: "TEST" }, registry.abilities.get(frame.abilityId)!, "on_play", (prefix) => `${prefix}_${state.nextId++}`, frame));
        return "paused";
      }
      if (operation.type === "attach_rested_don") { log.push(operation.count); return "complete"; }
      return { error: "Unexpected operation" };
    },
  });
}
function resolve(state: MatchState, log: number[]) {
  const choice = state.pendingChoices.shift()!;
  const options = choice.search!.options;
  expect(resolveDeclarativeSearch(state, 0, choice, options[0]!.id, options.slice(1).map((option) => option.id), (defId, id) => ({ id: id!, defId, attachedDonIds: [], rested: false }), [], registry)).toBeNull();
  expect(run(state, choice.resolutionFrameId!, log)).toBeNull();
}

describe("serializable sequential execution", () => {
  it("pauses nested and repeated searches and resumes without repeating completed operations", () => {
    const state = initial();
    const log: number[] = [];
    expect(run(state, "root", log)).toBeNull();
    expect(log).toEqual([1]);
    expect(state.pendingChoices).toHaveLength(1);
    expect(state.resolutionFrames).toHaveLength(2);
    const restored = JSON.parse(JSON.stringify(state)) as MatchState;
    const restoredLog = [...log];
    resolve(state, log);
    expect(log).toEqual([1, 2]);
    expect(state.resolutionFrames.find((frame) => frame.abilityId === "child")?.operationIndex).toBe(2);
    resolve(state, log);
    expect(log).toEqual([1, 2, 3]);
    expect(state.resolutionFrames).toHaveLength(1);
    resolve(state, log);
    expect(log).toEqual([1, 2, 3, 4]);
    expect(state.pendingChoices).toEqual([]);
    expect(state.resolutionFrames).toEqual([]);
    for (let i = 0; i < 3; i++) resolve(restored, restoredLog);
    expect(restoredLog).toEqual(log);
    expect(restored).toEqual(state);
  });
});
