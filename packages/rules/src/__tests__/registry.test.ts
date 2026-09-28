import { describe, expect, it } from "vitest";
import { ABILITY_LAFFITTE_SEARCH, applyIntent, createMatch, createSeededRng, deserializeMatch, getPlayerView, listLegalIntents, serializeMatch } from "../index.js";
import { compileAbilityRegistry, RegistryValidationError } from "../registry/compiler.js";
import { ABILITY_SCHEMA_VERSION } from "../registry/schema.js";
import type { CardInstance, MatchState } from "../types.js";

const filler = Array.from({ length: 20 }, () => "ST01-003");
function card(id: string, defId: string): CardInstance { return { id, defId, rested: false, attachedDonIds: [] }; }
function activeState(): MatchState {
  const state = createMatch({ seed: 17, firstSeat: 0, players: [{ leaderId: "OP16-080", deck: [...filler] }, { leaderId: "ST01-001", deck: [...filler] }] });
  state.phase = "main";
  state.activeSeat = 0;
  state.players[0].mulliganDone = true;
  state.players[1].mulliganDone = true;
  state.players[0].costArea = [{ id: "don_1", rested: false, attachedTo: null }];
  state.players[0].characters = [card("laffitte_1", "OP09-095")];
  state.players[0].deck = ["OP09-086", "ST01-008", "ST01-009", "ST01-006", "OP09-099"];
  return state;
}

describe("versioned declarative ability registry", () => {
  it("rejects unknown operations and duplicate stable ability ids with paths", () => {
    const program = { schemaVersion: ABILITY_SCHEMA_VERSION, id: "duplicate", kind: "triggered", zones: ["stage"], windows: ["on_play"], conditions: [], costs: [], operations: [{ type: "unknown_operation" }], implementation: "implemented", testRefs: [] };
    expect(() => compileAbilityRegistry([{ cardDefId: "A", abilities: [program] }, { cardDefId: "B", abilities: [{ ...program, operations: [{ type: "invoke_ability", abilityId: "missing" }] }] }])).toThrow(RegistryValidationError);
    try {
      compileAbilityRegistry([{ cardDefId: "A", abilities: [program] }, { cardDefId: "B", abilities: [{ ...program, operations: [{ type: "invoke_ability", abilityId: "missing" }] }] }]);
    } catch (error) {
      expect((error as RegistryValidationError).diagnostics.join("\n")).toMatch(/operations\[0\]\.type|duplicate ability|unknown ability/);
    }
  });

  it("serializes a paused search and resumes to the same state and events", () => {
    const activated = applyIntent(activeState(), { type: "activate_ability", sourceId: "laffitte_1", abilityId: ABILITY_LAFFITTE_SEARCH }, { seat: 0, rng: createSeededRng(999) });
    expect(activated.ok).toBe(true);
    expect(activated.state.resolutionFrames).toHaveLength(1);
    const restored = deserializeMatch(serializeMatch(activated.state));
    const choice = activated.state.pendingChoices[0]!;
    const selectedBefore = choice.search!.options.find((option) => option.defId === "OP09-086")!;
    const selectedIndex = choice.search!.options.findIndex((option) => option.id === selectedBefore.id);
    const selectedInstanceId = activated.state.resolutionFrames[0]!.bindings.expectedInstanceIds as string[];
    expect(getPlayerView(restored, 0)).toEqual(getPlayerView(activated.state, 0));
    expect(listLegalIntents(restored, 0)).toEqual(listLegalIntents(activated.state, 0));
    const selectedOptionId = selectedBefore.id;
    const orderedOptionIds = choice.search!.options.filter((option) => option.id !== selectedOptionId).map((option) => option.id).reverse();
    const intent = { type: "resolve_pending_choice" as const, accept: true, selectedOptionId, orderedOptionIds };
    const uninterrupted = applyIntent(activated.state, intent, { seat: 0, rng: createSeededRng(1) });
    const resumed = applyIntent(restored, intent, { seat: 0, rng: createSeededRng(987654) });
    expect(resumed.ok).toBe(true);
    expect(resumed.state).toEqual(uninterrupted.state);
    expect(resumed.events).toEqual(uninterrupted.events);
    expect(resumed.state.resolutionFrames).toEqual([]);
    expect(resumed.state.players[0].hand.find((card) => card.defId === "OP09-086")?.id).toBe(selectedInstanceId[selectedIndex]);
  });

  it("rejects snapshots from an incompatible rules contract", () => {
    const raw = JSON.parse(serializeMatch(activeState()));
    raw.registryHash = "stale";
    expect(() => deserializeMatch(JSON.stringify(raw))).toThrow(/registry/);
  });

  it("rejects broken serialized search continuations", () => {
    const activated = applyIntent(activeState(), { type: "activate_ability", sourceId: "laffitte_1", abilityId: ABILITY_LAFFITTE_SEARCH }, { seat: 0, rng: createSeededRng(1) });
    expect(activated.ok).toBe(true);
    const corruptions: Array<(state: MatchState) => void> = [
      (state) => { state.resolutionFrames[0]!.operationIndex = -1; },
      (state) => { state.resolutionFrames[0]!.operationIndex = 100; },
      (state) => { state.resolutionFrames[0]!.bindings.parentFrameId = state.resolutionFrames[0]!.id; },
      (state) => { state.resolutionFrames[0]!.bindings.expectedInstanceIds = []; },
      (state) => { state.resolutionFrames.push(structuredClone(state.resolutionFrames[0]!)); },
      (state) => { state.pendingChoices[0]!.resolutionFrameId = "missing"; },
      (state) => { state.pendingChoices[0]!.seat = 1; },
      (state) => { state.pendingChoices = []; },
      (state) => { state.pendingChoices.push(structuredClone(state.pendingChoices[0]!)); },
    ];
    for (const corrupt of corruptions) {
      const broken = structuredClone(activated.state);
      corrupt(broken);
      expect(() => deserializeMatch(JSON.stringify(broken))).toThrow(/Snapshot continuation/);
    }
  });

  it("restores My Era's nested Trigger invocation", () => {
    const state = activeState();
    state.pendingChoices = [{ id: "trigger", seat: 0, cardDefId: "OP09-096", kind: "life_trigger", optional: true, prompt: "Trigger", sourceInstanceId: "my_era_life" }];
    const accepted = applyIntent(state, { type: "resolve_pending_choice", accept: true }, { seat: 0, rng: createSeededRng(1) });
    expect(accepted.ok, accepted.error?.message).toBe(true);
    expect(accepted.state.resolutionFrames).toHaveLength(2);
    expect(deserializeMatch(serializeMatch(accepted.state))).toEqual(accepted.state);
  });
});
