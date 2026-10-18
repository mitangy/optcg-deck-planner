import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  fetchAccountDecks: vi.fn(),
  putAccountDecks: vi.fn(),
  putAccountDeck: vi.fn(),
  deleteAccountDeck: vi.fn(),
}));
vi.mock("../net/prefsApi", () => api);

import { deleteDeck, getSelectedDeckId, listSavedDecks, saveDeck, setSelectedDeckId } from "../decks/storage";
import { clearAccountDecks, flushDeckSync, stopDeckSync, syncDecks } from "./deckSync";

const wire = (id: string, updatedAt: number, name = id) => ({
  id,
  updatedAt,
  deleted: false,
  deck: { name, leaderId: "ST01-001", cards: [] },
});

describe("deck sync (#619)", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    vi.stubGlobal("window", { dispatchEvent: () => true });
    vi.useFakeTimers();
    api.fetchAccountDecks.mockReset();
    api.putAccountDecks.mockReset().mockResolvedValue({ decks: [] });
    api.putAccountDeck.mockReset().mockImplementation(async (id, deck, updatedAt) => ({ id, updatedAt, deleted: false, deck }));
    api.deleteAccountDeck.mockReset().mockImplementation(async (id, updatedAt) => ({ id, updatedAt, deleted: true }));
  });

  afterEach(() => {
    stopDeckSync();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("uploads this browser's decks on first sign-in and keeps the account's others", async () => {
    saveDeck({ id: "mine", name: "Mine", leaderId: "ST01-001", cards: [] });
    api.fetchAccountDecks.mockResolvedValue({ decks: [wire("theirs", 5)] });
    await syncDecks(7);
    expect(api.putAccountDecks.mock.calls[0][0].map((d: { id: string }) => d.id)).toEqual(["mine"]);
    expect(listSavedDecks().map((d) => d.id).sort()).toEqual(["mine", "theirs"]);
  });

  it("sign-out flush sends an edit still waiting on the push delay (#619)", async () => {
    api.fetchAccountDecks.mockResolvedValue({ decks: [] });
    await syncDecks(7);
    saveDeck({ id: "late", name: "Late", leaderId: "ST01-001", cards: [] });
    await flushDeckSync();
    expect(api.putAccountDeck.mock.calls.map((c) => c[0])).toEqual(["late"]);
  });

  it("pushes a later save after a short pause, and a delete as a delete", async () => {
    api.fetchAccountDecks.mockResolvedValue({ decks: [] });
    await syncDecks(7);
    saveDeck({ id: "a", name: "A", leaderId: "ST01-001", cards: [] });
    await vi.advanceTimersByTimeAsync(400);
    saveDeck({ id: "a", name: "A2", leaderId: "ST01-001", cards: [] });
    await vi.advanceTimersByTimeAsync(400);
    expect(api.putAccountDeck).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(api.putAccountDeck).toHaveBeenCalledTimes(1);
    expect(api.putAccountDeck.mock.calls[0][1].name).toBe("A2");
    deleteDeck("a");
    await vi.advanceTimersByTimeAsync(700);
    expect(api.deleteAccountDeck).toHaveBeenCalledTimes(1);
  });

  it("sends a delete that failed offline on the next start", async () => {
    api.fetchAccountDecks.mockResolvedValue({ decks: [] });
    await syncDecks(7);
    saveDeck({ id: "a", name: "A", leaderId: "ST01-001", cards: [] });
    await vi.advanceTimersByTimeAsync(700);
    api.deleteAccountDeck.mockRejectedValueOnce(new Error("offline"));
    deleteDeck("a");
    await vi.advanceTimersByTimeAsync(700);
    stopDeckSync();

    api.deleteAccountDeck.mockClear();
    api.fetchAccountDecks.mockResolvedValue({ decks: [wire("a", Date.now() - 5000)] });
    await syncDecks(7);
    await vi.advanceTimersByTimeAsync(700);
    expect(api.deleteAccountDeck).toHaveBeenCalledTimes(1);
    expect(listSavedDecks().find((d) => d.id === "a")).toBeUndefined();
  });

  it("does not upload one account's leftover decks to the next account that signs in", async () => {
    api.fetchAccountDecks.mockResolvedValue({ decks: [] });
    await syncDecks(7);
    stopDeckSync();
    saveDeck({ id: "a", name: "A", leaderId: "ST01-001", cards: [] });
    await syncDecks(8);
    expect(api.putAccountDecks).not.toHaveBeenCalled();
    expect(listSavedDecks()).toEqual([]);
  });

  it("ignores an account load that finished after sync was stopped", async () => {
    let resolve!: (v: unknown) => void;
    api.fetchAccountDecks.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const sync = syncDecks(7);
    stopDeckSync();
    resolve({ decks: [wire("late", 5)] });
    await sync;
    expect(listSavedDecks()).toEqual([]);
  });

  it("sign-out removes the account's decks and the selection, leaving the starter decks", async () => {
    api.fetchAccountDecks.mockResolvedValue({ decks: [wire("theirs", 5)] });
    await syncDecks(7);
    setSelectedDeckId("theirs");
    clearAccountDecks();
    const ids = listSavedDecks().map((d) => d.id).sort();
    expect(ids).toEqual(["test-op16-black", "test-op17-red"]);
    expect(getSelectedDeckId()).not.toBe("theirs");
    // A different player signing in next does not inherit or upload anything of the first.
    api.fetchAccountDecks.mockResolvedValue({ decks: [] });
    api.putAccountDecks.mockClear();
    await syncDecks(8);
    expect(api.putAccountDecks.mock.calls[0][0].map((d: { id: string }) => d.id).sort()).toEqual(["test-op16-black", "test-op17-red"]);
  });

  it("a deck deleted before sync starts stays deleted (#624)", async () => {
    saveDeck({ id: "x", name: "X", leaderId: "ST01-001", cards: [] });
    api.fetchAccountDecks.mockResolvedValue({ decks: [wire("x", Date.now() - 5000)] });
    await syncDecks(7);
    stopDeckSync();
    // /auth/me is slow or failed: no sync is running when the player deletes the deck.
    deleteDeck("x");
    await syncDecks(7);
    await vi.advanceTimersByTimeAsync(700);
    expect(api.deleteAccountDeck.mock.calls.map((c) => c[0])).toEqual(["x"]);
    expect(listSavedDecks().find((d) => d.id === "x")).toBeUndefined();
  });

  it("sign-out keeps a deck the account never received, as a guest deck (#624)", async () => {
    api.fetchAccountDecks.mockResolvedValue({ decks: [wire("theirs", 5)] });
    await syncDecks(7);
    saveDeck({ id: "rejected", name: "R", leaderId: "ST01-001", cards: [] });
    api.putAccountDeck.mockRejectedValue(new Error("422"));
    await flushDeckSync();
    clearAccountDecks();
    const ids = listSavedDecks().map((d) => d.id);
    expect(ids).toContain("rejected");
    expect(ids).not.toContain("theirs");
  });

  it("a deck kept at sign-out is offered to the next account as a guest deck (#624)", async () => {
    api.fetchAccountDecks.mockResolvedValue({ decks: [] });
    await syncDecks(7);
    saveDeck({ id: "rejected", name: "R", leaderId: "ST01-001", cards: [] });
    clearAccountDecks();
    api.fetchAccountDecks.mockResolvedValue({ decks: [] });
    await syncDecks(8);
    // The kept deck is a guest deck now: it is offered to the next account like any guest deck.
    expect(api.putAccountDecks.mock.calls[0][0].map((d: { id: string }) => d.id)).toContain("rejected");
  });

  it("a very long deck name is clamped to the 200 the account accepts (#624)", async () => {
    api.fetchAccountDecks.mockResolvedValue({ decks: [] });
    await syncDecks(7);
    saveDeck({ id: "long", name: "n".repeat(250), leaderId: "ST01-001", cards: [] });
    await vi.advanceTimersByTimeAsync(700);
    expect(api.putAccountDeck.mock.calls[0][1].name).toHaveLength(200);
  });
});
