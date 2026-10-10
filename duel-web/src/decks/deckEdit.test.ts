import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { searchAtlas } from "../cards/searchAtlas";
import {
  addCardToDeck,
  addCard,
  applyDeckOps,
  applyOps,
  countCardInDeck,
  isDeckDirty,
  removeAllCopies,
  removeCard,
  saveDeckDraft,
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

describe("applying a Log Pose edit (#400)", () => {
  const make = (cards: string[]) => saveDeck({ id: "apply-deck", name: "Apply", leaderId: "ST01-001", cards });
  const copies = (id: string) => countCardInDeck(getSavedDeck("apply-deck")!, id);

  it("applies a Log Pose edit as one save with the right copies (#400)", () => {
    make(["ST01-006", "ST01-006", "ST01-006", "ST01-008", "ST01-009"]);
    const writes: string[] = [];
    const set = globalThis.localStorage.setItem.bind(globalThis.localStorage);
    globalThis.localStorage.setItem = (k, v) => {
      writes.push(k);
      set(k, v);
    };
    const result = applyDeckOps("apply-deck", [
      { id: "ST01-006", before: 3, after: 1 },
      { id: "ST01-010", before: 0, after: 3 },
      { id: "ST01-009", before: 1, after: 0 },
    ]);
    expect(result.ok).toBe(true);
    expect(copies("ST01-006")).toBe(1);
    expect(copies("ST01-010")).toBe(3);
    expect(copies("ST01-009")).toBe(0);
    expect(copies("ST01-008")).toBe(1);
    expect(getSavedDeck("apply-deck")!.cards).toHaveLength(5);
    // One write for the whole edit, so a reload never shows half of it.
    expect(writes.filter((k) => k === "optcg.duel.savedDecks.v1")).toHaveLength(1);
    // Undo is the reverse diff.
    expect(
      applyDeckOps("apply-deck", [
        { id: "ST01-006", before: 1, after: 3 },
        { id: "ST01-010", before: 3, after: 0 },
        { id: "ST01-009", before: 0, after: 1 },
      ]).ok,
    ).toBe(true);
    expect(copies("ST01-006")).toBe(3);
    expect(copies("ST01-010")).toBe(0);
    expect(copies("ST01-009")).toBe(1);
    deleteDeck("apply-deck");
  });

  it("refuses a Log Pose edit when a card's count moved (#400)", () => {
    make(["ST01-006", "ST01-006", "ST01-008"]);
    const result = applyDeckOps("apply-deck", [
      { id: "ST01-008", before: 1, after: 0 },
      { id: "ST01-006", before: 3, after: 1 },
    ]);
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/ST01-006 has 2 copies now, not 3/) });
    // Nothing was saved, not even the card that was still right.
    expect(copies("ST01-008")).toBe(1);
    expect(copies("ST01-006")).toBe(2);
    deleteDeck("apply-deck");
  });

  it("refuses to put a leader in the main deck (#400)", () => {
    make(["ST01-006"]);
    const result = applyDeckOps("apply-deck", [{ id: "ST01-001", before: 0, after: 1 }]);
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/Leaders/) });
    expect(getSavedDeck("apply-deck")!.cards).toEqual(["ST01-006"]);
    deleteDeck("apply-deck");
  });
});

describe("editing an unsaved draft (#481)", () => {
  it("edits a card list without changing the list or the saved deck (#481)", () => {
    const saved = saveDeck({ id: "draft-deck", name: "Draft", leaderId: "ST01-001", cards: ["ST01-006", "ST01-006"] });
    const added = addCard(saved.cards, "ST01-008");
    expect(added).toEqual({ ok: true, cards: ["ST01-006", "ST01-006", "ST01-008"] });
    expect(removeCard(saved.cards, "ST01-006")).toEqual({ ok: true, cards: ["ST01-006"] });
    expect(removeAllCopies(saved.cards, "ST01-006")).toEqual({ ok: true, cards: [] });
    expect(applyOps(saved.cards, [{ id: "ST01-006", before: 2, after: 3 }])).toMatchObject({ ok: true });
    expect(saved.cards).toEqual(["ST01-006", "ST01-006"]);
    expect(getSavedDeck("draft-deck")!.cards).toEqual(["ST01-006", "ST01-006"]);
  });

  it("is dirty for a swapped card or leader, not for the same cards in another order (#481)", () => {
    const saved = { leaderId: "ST01-001", cards: ["ST01-006", "ST01-008", "ST01-006"] };
    expect(isDeckDirty(saved, { leaderId: "ST01-001", cards: ["ST01-008", "ST01-006", "ST01-006"] })).toBe(false);
    expect(isDeckDirty(saved, { leaderId: "ST01-001", cards: ["ST01-006", "ST01-008", "ST01-009"] })).toBe(true);
    expect(isDeckDirty(saved, { leaderId: "ST01-001", cards: ["ST01-006", "ST01-008"] })).toBe(true);
    expect(isDeckDirty(saved, { leaderId: "ST01-002", cards: saved.cards })).toBe(true);
  });

  it("saving a draft marks a planner-linked deck edited and drops art prefs of removed cards (#481)", () => {
    saveDeck({
      id: "draft-linked",
      name: "Linked",
      leaderId: "ST01-001",
      cards: ["ST01-006", "ST01-008"],
      artPrefs: { "ST01-006": "p1", "ST01-008": "p1" },
      plannerDeckId: 5,
    });
    const result = saveDeckDraft("draft-linked", { leaderId: "ST01-001", cards: ["ST01-006"] });
    expect(result.ok).toBe(true);
    const deck = getSavedDeck("draft-linked")!;
    expect(deck.cards).toEqual(["ST01-006"]);
    expect(deck.editedLocally).toBe(true);
    expect(deck.artPrefs).toEqual({ "ST01-006": "p1" });
    saveDeck({ id: "draft-plain", name: "Plain", leaderId: "ST01-001", cards: [] });
    saveDeckDraft("draft-plain", { leaderId: "ST01-001", cards: ["ST01-006"] });
    expect(getSavedDeck("draft-plain")!.editedLocally).toBeUndefined();
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
