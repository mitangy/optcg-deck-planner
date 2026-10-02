import { describe, expect, it } from "vitest";
import { deckStatsCards } from "./DeckStatsSection";

describe("deckStatsCards", () => {
  it("turns the editor's one-id-per-copy list into copies per card for deck stats (#242)", () => {
    expect(deckStatsCards(["OP01-004", "OP01-016", "OP01-004", "OP01-004", "OP01-016", "OP01-030"])).toEqual([
      { id: "OP01-004", copies: 3 },
      { id: "OP01-016", copies: 2 },
      { id: "OP01-030", copies: 1 },
    ]);
  });
});
