import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveCardImageUrl } from "./artPrefs";
import {
  deleteDeck,
  getSavedDeck,
  saveDeck,
  setDeckArtPref,
} from "./storage";

const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  // vitest node env — lightweight localStorage stub for deck persistence tests
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => {
      memory.set(k, String(v));
    },
    removeItem: (k) => {
      memory.delete(k);
    },
    clear: () => memory.clear(),
    key: () => null,
    get length() {
      return memory.size;
    },
  };
});

afterEach(() => {
  memory.clear();
});

describe("setDeckArtPref", () => {
  it("writes artPrefs[defId] onto the saved deck", () => {
    const deck = saveDeck({
      id: "cfg-test-deck",
      name: "Config test",
      leaderId: "ST01-001",
      cards: ["ST01-006", "ST01-006"],
    });
    const updated = setDeckArtPref(deck.id, "ST01-006", "p1");
    expect(updated?.artPrefs).toEqual({ "ST01-006": "p1" });
    expect(getSavedDeck(deck.id)?.artPrefs?.["ST01-006"]).toBe("p1");

    const cleared = setDeckArtPref(deck.id, "ST01-006", null);
    expect(cleared?.artPrefs).toBeUndefined();
    deleteDeck(deck.id);
  });

  it("preserves artPrefs when saveDeck omits them", () => {
    saveDeck({
      id: "cfg-preserve",
      name: "Preserve",
      leaderId: "ST01-001",
      cards: ["ST01-006"],
      artPrefs: { "ST01-001": "p1" },
    });
    saveDeck({
      id: "cfg-preserve",
      name: "Preserve renamed",
      leaderId: "ST01-001",
      cards: ["ST01-006", "ST01-006"],
    });
    expect(getSavedDeck("cfg-preserve")?.artPrefs).toEqual({
      "ST01-001": "p1",
    });
    deleteDeck("cfg-preserve");
  });
});

describe("resolveCardImageUrl with deck artPrefs", () => {
  it("uses SavedDeck.artPrefs when deck is passed", () => {
    const deck = saveDeck({
      id: "cfg-resolve",
      name: "Resolve",
      leaderId: "ST01-001",
      cards: ["ST01-006"],
      artPrefs: { "ST01-006": "p2" },
    });
    const url = resolveCardImageUrl("ST01-006", deck);
    expect(url).toContain("ST01-006_p2");
    const standard = resolveCardImageUrl("ST01-006", {
      ...deck,
      artPrefs: undefined,
    });
    expect(standard).toBe("/cards/ST01-006.png");
    deleteDeck(deck.id);
  });
});
