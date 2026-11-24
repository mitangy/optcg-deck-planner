import { describe, expect, it } from "vitest";
import { filterLeaders, leaderDeckName, startButtonLabel, type PickableLeader } from "./newDeckStart";

const LEADERS: PickableLeader[] = [
  { id: "OP01-001", name: "Roronoa Zoro", colors: ["red"] },
  { id: "OP02-025", name: "Charlotte Linlin", colors: ["yellow", "purple"] },
  { id: "OP09-061", name: "Monkey.D.Luffy", colors: ["purple"] },
];

describe("new deck start (#1343)", () => {
  it("an empty deck name defaults to the Leader's name plus deck, a typed name wins (#1343)", () => {
    expect(leaderDeckName("", "Roronoa Zoro")).toBe("Roronoa Zoro deck");
    expect(leaderDeckName("   ", "Roronoa Zoro")).toBe("Roronoa Zoro deck");
    expect(leaderDeckName("  Zoro rush ", "Roronoa Zoro")).toBe("Zoro rush");
  });

  it("Leader search matches the name or id in any case (#1343)", () => {
    expect(filterLeaders(LEADERS, "linlin", []).map((l) => l.id)).toEqual(["OP02-025"]);
    expect(filterLeaders(LEADERS, "op09", []).map((l) => l.id)).toEqual(["OP09-061"]);
    expect(filterLeaders(LEADERS, "  ", [])).toHaveLength(3);
  });

  it("colour chips keep a Leader that has any chosen colour, and combine with the search (#1343)", () => {
    expect(filterLeaders(LEADERS, "", ["purple"]).map((l) => l.id)).toEqual(["OP02-025", "OP09-061"]);
    expect(filterLeaders(LEADERS, "", ["red", "yellow"]).map((l) => l.id)).toEqual(["OP01-001", "OP02-025"]);
    expect(filterLeaders(LEADERS, "monkey", ["purple"]).map((l) => l.id)).toEqual(["OP09-061"]);
    expect(filterLeaders(LEADERS, "zoro", ["purple"])).toEqual([]);
  });

  it("the gold button is labelled for the chosen start (#1343)", () => {
    expect(startButtonLabel("leader", "")).toBe("Create deck");
    expect(startButtonLabel("meta", "")).toBe("Copy this deck");
    expect(startButtonLabel("paste", "")).toBe("Create blank deck");
    expect(startButtonLabel("paste", "1xST01-001")).toBe("Import deck");
  });
});
