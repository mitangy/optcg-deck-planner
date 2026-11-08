import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLocalDecks,
  getSelectedDeckId,
  saveDeck,
  saveDeckResult,
  setArtPref,
  setSelectedDeckId,
} from "./storage";

const deck = { id: "a", name: "A", leaderId: "ST01-001", cards: [] };

describe("saving when browser storage refuses writes (refactor 0.6)", () => {
  let writable: boolean;
  const store = new Map<string, string>();

  beforeEach(() => {
    writable = false;
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (!writable) throw new DOMException("full", "QuotaExceededError");
        store.set(k, v);
      },
      removeItem: () => {
        if (!writable) throw new DOMException("blocked", "SecurityError");
      },
    });
    vi.stubGlobal("window", { dispatchEvent: () => true });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("saveDeck hands back the deck instead of throwing out of the click handler", () => {
    expect(saveDeck(deck)).toMatchObject({ id: "a", name: "A" });
  });

  it("saveDeckResult says the deck was not persisted, and says it was when storage works", () => {
    expect(saveDeckResult(deck).persisted).toBe(false);
    writable = true;
    expect(saveDeckResult(deck).persisted).toBe(true);
    expect(store.get("optcg.duel.savedDecks.v1")).toContain('"id":"a"');
  });

  it("selection, art preference and sign-out clearing do not throw either", () => {
    expect(() => setSelectedDeckId("a")).not.toThrow();
    expect(() => setSelectedDeckId(null)).not.toThrow();
    expect(() => setArtPref("ST01-001", "p1")).not.toThrow();
    expect(() => clearLocalDecks()).not.toThrow();
  });

  it("reading the selected deck falls back to none when storage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    expect(getSelectedDeckId()).toBeNull();
  });
});
