// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { DECK_SORTS, filterDecks, loadDeckSort, parseDeckSort, saveDeckSort, sortDecks } from "./deckListView";

// Leaders: OP11-041 Nami, OP13-079 Imu, OP15-002 Lucy. Name, leader and recency orders all differ.
const ALPHA = { id: "a", name: "Alpha", leaderId: "OP11-041", updatedAt: 2 };
const BRAVO = { id: "b", name: "Bravo", leaderId: "OP13-079", updatedAt: 1 };
const CHARLIE = { id: "c", name: "Charlie", leaderId: "OP15-002", updatedAt: 3 };
const DECKS = [ALPHA, BRAVO, CHARLIE];
const ids = (list: { id: string }[]) => list.map((d) => d.id);

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("Decks page search and sort (#747)", () => {
  it("search finds a deck by its leader's name, not only the deck's own name (#747)", () => {
    expect(ids(filterDecks(DECKS, "imu"))).toEqual(["b"]);
  });

  it("search finds a deck by its name in any case, and by its leader's card number (#747)", () => {
    expect(ids(filterDecks(DECKS, "ALPHA"))).toEqual(["a"]);
    expect(ids(filterDecks(DECKS, "op15-002"))).toEqual(["c"]);
  });

  it("search shows every deck for empty or blank text and none for text nothing matches (#747)", () => {
    expect(ids(filterDecks(DECKS, ""))).toEqual(["a", "b", "c"]);
    expect(ids(filterDecks(DECKS, "   "))).toEqual(["a", "b", "c"]);
    expect(filterDecks(DECKS, "zzz")).toEqual([]);
  });

  it("sorts by last edit newest first, by name A to Z, or by leader name A to Z (#747)", () => {
    expect(ids(sortDecks(DECKS, "recent"))).toEqual(["c", "a", "b"]);
    expect(ids(sortDecks(DECKS, "name"))).toEqual(["a", "b", "c"]);
    expect(ids(sortDecks(DECKS, "leader"))).toEqual(["b", "c", "a"]);
  });

  it("sorts decks that share a leader by deck name, and does not reorder the list it was given (#747)", () => {
    const same = [
      { id: "z", name: "Zeta", leaderId: "OP11-041", updatedAt: 1 },
      { id: "y", name: "Yankee", leaderId: "OP11-041", updatedAt: 1 },
    ];
    expect(ids(sortDecks(same, "leader"))).toEqual(["y", "z"]);
    expect(ids(same)).toEqual(["z", "y"]);
  });

  it("offers the three sorts and falls back to Recently updated for an unknown stored value (#747)", () => {
    expect(DECK_SORTS.map((s) => s.id)).toEqual(["recent", "name", "leader"]);
    expect(parseDeckSort("leader")).toBe("leader");
    expect(parseDeckSort("win-rate")).toBe("recent");
    expect(parseDeckSort(null)).toBe("recent");
  });

  it("remembers the sort that was picked, and still loads when storage is blocked (#747)", () => {
    expect(loadDeckSort()).toBe("recent");
    saveDeckSort("name");
    expect(loadDeckSort()).toBe("name");
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(loadDeckSort()).toBe("recent");
    expect(() => saveDeckSort("leader")).not.toThrow();
  });
});
