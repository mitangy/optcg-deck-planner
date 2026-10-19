import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyRemoteDecks,
  deleteDeck,
  listSavedDecks,
  onLocalDecksChange,
  saveDeck,
  SAVED_DECKS_CHANGED_EVENT,
  type LocalDeckChange,
} from "./storage";

describe("saved deck change hooks (#619)", () => {
  let events: number;
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    events = 0;
    vi.stubGlobal("window", {
      dispatchEvent: (e: Event) => void (e.type === SAVED_DECKS_CHANGED_EVENT && events++),
    });
  });

  it("tells listeners about a save and a delete, but not an unknown id", () => {
    const seen: LocalDeckChange[] = [];
    const off = onLocalDecksChange((c) => seen.push(c));
    const d = saveDeck({ id: "a", name: "A", leaderId: "ST01-001", cards: [] });
    deleteDeck("a");
    deleteDeck("nope");
    off();
    saveDeck({ id: "b", name: "B", leaderId: "ST01-001", cards: [] });
    expect(seen).toEqual([
      { kind: "upsert", deck: d },
      { kind: "delete", id: "a", at: expect.any(Number) },
    ]);
  });

  it("applies account decks without echoing them back, then announces the change", () => {
    saveDeck({ id: "old", name: "Old", leaderId: "ST01-001", cards: [] });
    const seen: LocalDeckChange[] = [];
    onLocalDecksChange((c) => seen.push(c));
    applyRemoteDecks({
      upsert: [{ id: "new", name: "New", leaderId: "ST01-001", cards: [], updatedAt: 5 }],
      remove: ["old"],
    });
    expect(seen).toEqual([]);
    expect(events).toBe(1);
    expect(listSavedDecks().map((d) => d.id)).toEqual(["new"]);
  });
});
