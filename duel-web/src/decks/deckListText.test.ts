import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deckListText } from "./deckListText";
import { duplicateDeck, getSavedDeck, saveDeck, validateImportedList } from "./storage";

const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => void memory.set(k, String(v)),
    removeItem: (k) => void memory.delete(k),
    clear: () => memory.clear(),
    key: () => null,
    get length() {
      return memory.size;
    },
  };
});

afterEach(() => memory.clear());

describe("deck list copy and duplicate (#1386)", () => {
  it("the copied deck list puts the Leader first, groups counts and reads back through the importer (#1386)", () => {
    const cards = ["ST01-006", "ST01-003", "ST01-003", "ST01-006", "ST01-003", "ST01-003", "ST01-006"];
    const text = deckListText({ leaderId: "ST01-001", cards });
    expect(text).toBe("1xST01-001\n4xST01-003\n3xST01-006");
    const back = validateImportedList(text);
    expect(back.leaderId).toBe("ST01-001");
    expect([...back.cards].sort()).toEqual([...cards].sort());
  });

  it("a duplicate copies the cards and art picks but drops every link to the original deck (#1386)", () => {
    const orig = saveDeck({
      name: "Zoro",
      leaderId: "ST01-001",
      cards: ["ST01-003", "ST01-003"],
      artPrefs: { "ST01-003": "ST01-003_p1" },
      plannerDeckId: 77,
      editedLocally: true,
    });
    const copy = duplicateDeck(orig.id)!;
    expect(copy.id).not.toBe(orig.id);
    expect(copy.name).toBe("Zoro (copy)");
    expect(copy.leaderId).toBe("ST01-001");
    expect(copy.cards).toEqual(["ST01-003", "ST01-003"]);
    expect(copy.artPrefs).toEqual({ "ST01-003": "ST01-003_p1" });
    expect(copy.plannerDeckId).toBeUndefined();
    expect(copy.editedLocally).toBeUndefined();
    expect(copy.noMerge).toBe(true);
    expect(orig.noMerge).toBeUndefined();
    expect(getSavedDeck(copy.id)?.plannerDeckId).toBeUndefined();
    expect(getSavedDeck(orig.id)?.plannerDeckId).toBe(77);
  });

  it("duplicating a deck that is gone saves nothing (#1386)", () => {
    expect(duplicateDeck("nope")).toBeUndefined();
  });
});
