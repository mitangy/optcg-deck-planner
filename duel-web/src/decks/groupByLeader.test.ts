import { describe, expect, it } from "vitest";
import { groupByLeader } from "./groupByLeader";

describe("groupByLeader", () => {
  it("groups by leader in first-appearance order and keeps input order inside a group (#1294)", () => {
    const decks = [
      { n: "A1", l: "OP09-001" },
      { n: "B1", l: "OP01-001" },
      { n: "A2", l: "OP09-001" },
      { n: "C1", l: "ST01-001" },
      { n: "B2", l: "OP01-001" },
    ];
    const groups = groupByLeader(decks, (d) => d.l);
    expect(groups.map((g) => g.leaderId)).toEqual(["OP09-001", "OP01-001", "ST01-001"]);
    expect(groups.map((g) => g.items.map((d) => d.n))).toEqual([["A1", "A2"], ["B1", "B2"], ["C1"]]);
  });
});
