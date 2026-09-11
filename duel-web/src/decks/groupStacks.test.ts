import { describe, expect, it } from "vitest";
import { groupDeckStacks } from "./groupStacks";

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
