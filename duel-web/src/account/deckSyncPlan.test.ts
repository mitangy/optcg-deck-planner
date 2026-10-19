import { describe, expect, it } from "vitest";
import type { SavedDeck } from "../decks/storage";
import { planDeckSync, type DeckSyncInput, type RemoteDeck } from "./deckSyncPlan";

const deck = (id: string, updatedAt: number, name = id): SavedDeck => ({
  id,
  name,
  leaderId: "OP17-001",
  cards: [],
  updatedAt,
});
const live = (id: string, updatedAt: number, name = id): RemoteDeck => ({
  id,
  updatedAt,
  deleted: false,
  deck: { name, leaderId: "OP17-001", cards: [] },
});
const gone = (id: string, updatedAt: number): RemoteDeck => ({ id, updatedAt, deleted: true });

function plan(over: Partial<DeckSyncInput>) {
  return planDeckSync({ userId: 7, cacheOwner: 7, local: [], localDeletes: {}, remote: [], ...over });
}

describe("planDeckSync (#619)", () => {
  it("takes a deck only the account has", () => {
    const p = plan({ remote: [live("a", 5, "From account")] });
    expect(p.applyUpsert).toEqual([deck("a", 5, "From account")]);
    expect(p.uploadDecks).toEqual([]);
  });

  it("removes a local deck the account deleted after it was last edited", () => {
    const p = plan({ local: [deck("a", 5)], remote: [gone("a", 9)] });
    expect(p.applyDelete).toEqual(["a"]);
    expect(p.uploadDecks).toEqual([]);
  });

  it("keeps and uploads a local deck edited after the account deleted it", () => {
    const p = plan({ local: [deck("a", 9)], remote: [gone("a", 5)] });
    expect(p.applyDelete).toEqual([]);
    expect(p.uploadDecks).toEqual([deck("a", 9)]);
  });

  it("takes the account's copy when it is newer and uploads ours when ours is newer", () => {
    const newerRemote = plan({ local: [deck("a", 5, "old")], remote: [live("a", 9, "new")] });
    expect(newerRemote.applyUpsert.map((d) => d.name)).toEqual(["new"]);
    expect(newerRemote.uploadDecks).toEqual([]);
    const newerLocal = plan({ local: [deck("a", 9, "new")], remote: [live("a", 5, "old")] });
    expect(newerLocal.uploadDecks.map((d) => d.name)).toEqual(["new"]);
    expect(newerLocal.applyUpsert).toEqual([]);
  });

  it("does nothing for an identical timestamp", () => {
    const p = plan({ local: [deck("a", 5)], remote: [live("a", 5)] });
    expect(p).toEqual({ applyUpsert: [], applyDelete: [], uploadDecks: [], uploadDeletes: [] });
  });

  it("uploads local-only decks from guest storage on first sign-in", () => {
    const p = plan({ cacheOwner: null, local: [deck("a", 5), deck("b", 6)] });
    expect(p.uploadDecks.map((d) => d.id)).toEqual(["a", "b"]);
  });

  it("uploads local-only decks the same account saved while offline", () => {
    expect(plan({ cacheOwner: 7, local: [deck("a", 5)] }).uploadDecks).toHaveLength(1);
  });

  it("drops another account's cache instead of uploading it, and takes this account's decks", () => {
    const p = plan({
      cacheOwner: 3,
      local: [deck("theirs", 5), deck("shared", 99, "other user's edit")],
      remote: [live("shared", 1, "mine"), live("mine", 2)],
      localDeletes: { mine: 50 },
    });
    expect(p.uploadDecks).toEqual([]);
    expect(p.uploadDeletes).toEqual([]);
    expect(p.applyDelete).toEqual(["theirs"]);
    expect(p.applyUpsert.map((d) => `${d.id}:${d.name}`).sort()).toEqual(["mine:mine", "shared:mine"]);
  });

  it("sends a delete made offline when the account still has the deck, unless it was edited since", () => {
    const sent = plan({ remote: [live("a", 5)], localDeletes: { a: 9 } });
    expect(sent.uploadDeletes).toEqual([{ id: "a", at: 9 }]);
    expect(sent.applyUpsert).toEqual([]);
    const lost = plan({ remote: [live("a", 12)], localDeletes: { a: 9 } });
    expect(lost.uploadDeletes).toEqual([]);
    expect(lost.applyUpsert.map((d) => d.id)).toEqual(["a"]);
  });
});
