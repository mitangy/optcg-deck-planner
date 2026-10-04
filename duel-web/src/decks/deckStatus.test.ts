import { describe, expect, it } from "vitest";
import { isIncompleteDeck } from "./deckStatus";

describe("isIncompleteDeck", () => {
  it("flags a main deck under 50 cards, but not a full one (#282)", () => {
    expect(isIncompleteDeck({ cards: Array(20).fill("ST01-003") })).toBe(true);
    expect(isIncompleteDeck({ cards: Array(49).fill("ST01-003") })).toBe(true);
    expect(isIncompleteDeck({ cards: Array(50).fill("ST01-003") })).toBe(false);
  });
});
