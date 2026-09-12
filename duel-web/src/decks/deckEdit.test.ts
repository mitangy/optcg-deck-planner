import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { searchAtlas } from "../cards/searchAtlas";
import {
  addCardToDeck,
  countCardInDeck,
  removeAllCopiesFromDeck,
  removeCardFromDeck,
} from "./editDeck";
import { deleteDeck, getSavedDeck, saveDeck } from "./storage";

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

describe("editDeck add/remove", () => {
  it("adds and removes copies with a 4-copy cap", () => {
    const deck = saveDeck({
      id: "edit-deck",
      name: "Edit",
      leaderId: "ST01-001",
      cards: ["ST01-006"],
    });

    expect(addCardToDeck(deck.id, "ST01-006").ok).toBe(true);
    expect(countCardInDeck(getSavedDeck(deck.id)!, "ST01-006")).toBe(2);

    for (let i = 0; i < 2; i++) {
      expect(addCardToDeck(deck.id, "ST01-006").ok).toBe(true);
    }
    expect(countCardInDeck(getSavedDeck(deck.id)!, "ST01-006")).toBe(4);

    const capped = addCardToDeck(deck.id, "ST01-006");
    expect(capped.ok).toBe(false);
    if (!capped.ok) expect(capped.error).toMatch(/4 copies/);

    expect(removeCardFromDeck(deck.id, "ST01-006").ok).toBe(true);
    expect(countCardInDeck(getSavedDeck(deck.id)!, "ST01-006")).toBe(3);

    expect(removeAllCopiesFromDeck(deck.id, "ST01-006").ok).toBe(true);
    expect(getSavedDeck(deck.id)?.cards).toEqual([]);

    deleteDeck(deck.id);
  });

  it("rejects adding a leader to the main deck", () => {
    const deck = saveDeck({
      id: "edit-leader",
      name: "Leader",
      leaderId: "ST01-001",
      cards: [],
    });
    const result = addCardToDeck(deck.id, "ST01-001");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Leaders/);
    deleteDeck(deck.id);
  });
});

describe("searchAtlas filters", () => {
  it("filters by color, type, attribute, and counter", () => {
    const redChars = searchAtlas({
      colors: ["red"],
      types: ["character"],
      excludeLeaders: true,
    });
    expect(redChars.length).toBeGreaterThan(0);
    expect(redChars.every((e) => e.colors.includes("red"))).toBe(true);
    expect(redChars.every((e) => e.type === "character")).toBe(true);

    const strike = searchAtlas({ attributes: ["Strike"] });
    expect(strike.length).toBeGreaterThan(0);
    expect(strike.every((e) => e.attribute === "Strike")).toBe(true);

    const slash = searchAtlas({ attributes: ["Slash"] });
    expect(slash.every((e) => e.attribute === "Slash")).toBe(true);

    const c1k = searchAtlas({ counter: 1000 });
    expect(c1k.every((e) => e.counter === 1000)).toBe(true);

    const blockers = searchAtlas({ blocker: true });
    expect(blockers.every((e) => e.blocker === true)).toBe(true);

    const byName = searchAtlas({ query: "chopper" });
    expect(byName.some((e) => e.id === "ST01-006")).toBe(true);

    const teach = searchAtlas({ query: "teach" });
    expect(teach.some((e) => e.id === "OP16-080")).toBe(true);
    expect(searchAtlas({ query: "OP01-013" }).some((e) => e.id === "OP01-013")).toBe(
      true,
    );
  });
});
