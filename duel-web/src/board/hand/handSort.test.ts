import { describe, expect, it } from "vitest";
import { sortHandIndices } from "./handSort";

const costs: Record<string, number> = {
  "ST01-001": 1,
  "ST01-002": 2,
  "ST01-003": 3,
  "ST01-004": 4,
};

describe("sortHandIndices", () => {
  it("sorts by cost then groups identical defIds", () => {
    // Cost order differs from id order, and duplicates are interleaved.
    const cost: Record<string, number> = { "ST01-001": 2, "ST01-002": 1, "ST01-003": 2 };
    const hand = [
      { defId: "ST01-003" },
      { defId: "ST01-001" },
      { defId: "ST01-002" },
      { defId: "ST01-003" },
      { defId: "ST01-001" },
    ];
    expect(sortHandIndices(hand, (id) => cost[id] ?? 99)).toEqual([2, 1, 4, 0, 3]);
  });

  it("keeps stable order within the same defId and cost", () => {
    const hand = [{ defId: "ST01-002" }, { defId: "ST01-002" }, { defId: "ST01-002" }];
    expect(sortHandIndices(hand, (id) => costs[id] ?? 99)).toEqual([0, 1, 2]);
  });
});
