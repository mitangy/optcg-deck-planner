import { describe, expect, it } from "vitest";
import { groupDeckStacks, groupStacksByCost } from "./groupStacks";

describe("groupDeckStacks", () => {
  it("groups main-deck copies by defId with counts", () => {
    const stacks = groupDeckStacks("ST01-001", [
      "ST01-003",
      "ST01-003",
      "ST01-006",
      "ST01-003",
      "ST01-008",
      "ST01-006",
    ]);
    expect(stacks.leader).toEqual({ defId: "ST01-001", count: 1 });
    expect(stacks.main).toEqual([
      { defId: "ST01-003", count: 3 },
      { defId: "ST01-006", count: 2 },
      { defId: "ST01-008", count: 1 },
    ]);
  });

  it("returns empty main for leader-only", () => {
    const stacks = groupDeckStacks("OP16-080", []);
    expect(stacks.leader.defId).toBe("OP16-080");
    expect(stacks.main).toEqual([]);
  });
});

describe("groupStacksByCost (#1343)", () => {
  const costs: Record<string, number> = { A: 5, B: 1, C: 5, D: 0 };
  const stacks = [
    { defId: "A", count: 2 },
    { defId: "B", count: 4 },
    { defId: "C", count: 3 },
    { defId: "D", count: 1 },
  ];
  it("orders groups cheapest first, keeps the given order inside a cost and totals the copies", () => {
    const groups = groupStacksByCost(stacks, (id) => costs[id]);
    expect(groups.map((g) => [g.cost, g.stacks.map((s) => s.defId), g.cards])).toEqual([
      [0, ["D"], 1],
      [1, ["B"], 4],
      [5, ["A", "C"], 5],
    ]);
  });
});
