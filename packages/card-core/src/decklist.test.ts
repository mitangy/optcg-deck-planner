import { describe, expect, it } from "vitest";
import { expandDecklist, parseDecklist, toDecklistText } from "./decklist.js";

describe("parseDecklist shapes the backend reads differently", () => {
  it("reads a count glued to the card number as a count, not as a card letter suffix (ST01-014x4)", () => {
    expect(parseDecklist("ST01-014x4")).toEqual([{ cardId: "ST01-014", count: 4 }]);
    expect(parseDecklist("ST01-014 x4 Nami")).toEqual([{ cardId: "ST01-014", count: 4 }]);
  });
});

describe("deck list text", () => {
  it("writes the leader first with a count of one, then each card with its copies", () => {
    expect(toDecklistText(["ST01-003", "ST01-003", "ST01-006"], "ST01-001")).toBe("1xST01-001\n2xST01-003\n1xST01-006");
  });

  it("repeats each card id once per copy", () => {
    expect(expandDecklist([{ cardId: "ST01-003", count: 3 }, { cardId: "ST01-006", count: 1 }])).toEqual([
      "ST01-003",
      "ST01-003",
      "ST01-003",
      "ST01-006",
    ]);
  });
});
