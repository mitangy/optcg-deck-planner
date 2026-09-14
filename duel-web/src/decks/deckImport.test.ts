import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BLANK_DECK_LEADER_ID,
  createBlankDeck,
  createDeckFromInput,
  deleteDeck,
  getSavedDeck,
  importIntoSavedDeck,
  saveDeck,
} from "./storage";

const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
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

const SAMPLE = `1xST01-001
4xST01-003
4xST01-006`;

describe("createBlankDeck", () => {
  it("creates an empty main deck with placeholder leader", () => {
    const deck = createBlankDeck("Empty");
    expect(deck.name).toBe("Empty");
    expect(deck.leaderId).toBe(BLANK_DECK_LEADER_ID);
    expect(deck.cards).toEqual([]);
    deleteDeck(deck.id);
  });
});

describe("createDeckFromInput", () => {
  it("creates from import text", () => {
    const result = createDeckFromInput("ST01", SAMPLE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deck.leaderId).toBe("ST01-001");
    expect(result.deck.cards.length).toBe(8);
    deleteDeck(result.deck.id);
  });

  it("creates blank when text is empty", () => {
    const result = createDeckFromInput("Blank", "");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deck.cards).toEqual([]);
    deleteDeck(result.deck.id);
  });
});

describe("importIntoSavedDeck", () => {
  it("replaces leader and main on an existing deck", () => {
    const blank = createBlankDeck("Replace me");
    const result = importIntoSavedDeck(blank.id, SAMPLE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(getSavedDeck(blank.id)?.cards.length).toBe(8);
    deleteDeck(blank.id);
  });

  it("rejects invalid decklist text", () => {
    const blank = createBlankDeck("Bad import");
    const result = importIntoSavedDeck(blank.id, "not a deck");
    expect(result.ok).toBe(false);
    deleteDeck(blank.id);
  });

  it("returns error when deck id is missing", () => {
    const result = importIntoSavedDeck("missing-id", SAMPLE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain("Deck not found");
  });

  it("drops art prefs for cards removed by import", () => {
    const deck = createBlankDeck("Art prefs");
    saveDeck({
      id: deck.id,
      name: deck.name,
      leaderId: deck.leaderId,
      cards: ["ST01-009"],
      artPrefs: { "ST01-006": "p1", "ST01-009": "p2" },
    });
    const result = importIntoSavedDeck(deck.id, SAMPLE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(getSavedDeck(deck.id)?.artPrefs).toEqual({ "ST01-006": "p1" });
    deleteDeck(deck.id);
  });
});
