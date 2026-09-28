import { describe, expect, it } from "vitest";
import { compileAbilityRegistry, RegistryValidationError } from "../registry/compiler.js";

function program(overrides: Record<string, unknown> = {}) {
  return { schemaVersion: 1, id: "ability", kind: "continuous", zones: ["character"], windows: ["while_active"], conditions: [], costs: [], operations: [{ type: "grant_keyword", keyword: "rush" }], implementation: "implemented", testRefs: [], ...overrides };
}
function compile(overrides: Record<string, unknown>) {
  return compileAbilityRegistry([{ cardDefId: "TEST-001", abilities: [program(overrides)] }]);
}

describe("registry input validation", () => {
  it.each([
    ["operations", null, "operations"],
    ["conditions", [{ type: "any", conditions: [{ type: "attached_don_at_least", count: -1 }] }], "conditions[0].conditions[0].count"],
    ["operations", [{ type: "modify_power", target: "source", amount: "1000" }], "operations[0].amount"],
    ["operations", [{ type: "grant_keyword", keyword: "flying" }], "operations[0].keyword"],
    ["operations", [{ type: "modify_play_cost", target: "friendly_characters", amount: -1, minimum: 0 }], "operations[0].target"],
    ["operations", [{ type: "copy_opponent_character_power", duration: "forever" }], "operations[0].duration"],
    ["operations", [{ type: "modify_power", target: "source", amount: 1000, perTrashCards: 0 }], "operations[0].perTrashCards"],
    ["operations", [{ type: "grant_keyword", keyword: "rush", typo: true }], "operations[0].typo"],
    ["operations", [{ type: "search_top_deck", count: 3, maxSelect: 4, destination: "hand", remainder: "trash", selector: { traits: [5] } }], "operations[0].selector.traits[0]"],
    ["costs", [{ type: "rest_don", count: 0 }], "costs[0].count"],
  ])("rejects malformed %s with a precise path", (field, value, expectedPath) => {
    try {
      compile({ [field as string]: value });
      expect.fail("Malformed definition was accepted");
    } catch (error) {
      expect(error).toBeInstanceOf(RegistryValidationError);
      expect((error as RegistryValidationError).diagnostics.join("\n")).toContain(expectedPath);
      expect((error as RegistryValidationError).diagnostics.join("\n")).toContain("TEST-001");
    }
  });

  it("rejects non-JSON and cyclic input before traversing programs", () => {
    for (const amount of [NaN, Infinity, () => 1000, undefined]) {
      expect(() => compile({ operations: [{ type: "modify_power", target: "source", amount }] })).toThrow(RegistryValidationError);
    }
    const condition: Record<string, unknown> = { type: "any" };
    condition.conditions = [condition];
    expect(() => compile({ conditions: [condition] })).toThrow(/cyclic data/);
  });

  it("rejects timing/kind mismatches and top-level authoring typos", () => {
    expect(() => compile({ windows: ["on_play"] })).toThrow(/continuous abilities require only while_active/);
    expect(() => compile({ kind: "triggered" })).toThrow(/while_active requires a continuous ability/);
    expect(() => compile({ condition: [] })).toThrow(/condition: unknown field/);
  });

  it("isolates compiled data from authors and prevents nested mutation", () => {
    const authored = program();
    const registry = compileAbilityRegistry([{ cardDefId: "TEST-001", abilities: [authored] }]);
    authored.operations[0]!.keyword = "blocker";
    const compiled = registry.abilities.get("ability")!;
    expect(compiled.operations[0]).toEqual({ type: "grant_keyword", keyword: "rush" });
    expect(Object.isFrozen(compiled.operations[0])).toBe(true);
    expect("set" in registry.abilities).toBe(false);
    registry.abilities.forEach((_value, _key, map) => expect(map).toBe(registry.abilities));
    expect(compile({}).contentHash).toBe(registry.contentHash);
  });
});
