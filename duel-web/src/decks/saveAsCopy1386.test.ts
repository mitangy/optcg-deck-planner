// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { isStarterDeck, saveDeckAsCopy } from "./saveAsCopy";
import { getSavedDeck, listSavedDecks, saveDeck } from "./storage";

afterEach(() => localStorage.clear());

describe("saving a starter deck as a copy (#1386)", () => {
  it("copies the unsaved edits into a new deck named (copy) and leaves the original, with no planner link (#1386)", () => {
    const source = saveDeck({
      id: "test-op17-red",
      name: "Starter: OP17 Red",
      leaderId: "ST01-001",
      cards: ["ST01-006", "ST01-006"],
      artPrefs: { "ST01-006": "alt1", "ST01-007": "alt2" },
      plannerDeckId: 99,
    });
    const { deck, persisted } = saveDeckAsCopy(source, { name: "Starter: OP17 Red", leaderId: "ST01-001", cards: ["ST01-006", "ST01-007"] });
    expect(persisted).toBe(true);
    expect(deck.id).not.toBe(source.id);
    expect(deck.name).toBe("Starter: OP17 Red (copy)");
    expect(deck.cards).toEqual(["ST01-006", "ST01-007"]);
    expect(deck.plannerDeckId).toBeUndefined();
    expect(deck.noMerge).toBe(true);
    expect(deck.artPrefs).toEqual({ "ST01-006": "alt1", "ST01-007": "alt2" });
    expect(getSavedDeck(source.id)?.cards).toEqual(["ST01-006", "ST01-006"]);
    expect(listSavedDecks()).toHaveLength(2);
  });

  it("only ids starting with test- are starter decks (#1386)", () => {
    expect(isStarterDeck({ id: "test-op16-black" })).toBe(true);
    expect(isStarterDeck({ id: "a-test-deck" })).toBe(false);
  });
});
