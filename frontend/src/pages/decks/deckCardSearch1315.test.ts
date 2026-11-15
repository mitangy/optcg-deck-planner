import { describe, expect, it } from "vitest";
import type { DeckSummary } from "../../api";
import { findDecksWithCard } from "./deckCardSearch";

function deck(id: number, over: Partial<DeckSummary> = {}): DeckSummary {
  return { id, name: `Deck ${id}`, leader_card_id: null, card_count: 0, total_cards: 0, sort_order: id, cards: [], ...over };
}

const decks: DeckSummary[] = [
  deck(1, { leader_card_id: "OP01-001", leader_name: "Luffy", cards: [{ card_id: "OP01-016", name: "Nami", qty: 4 }, { card_id: "OP01-017", name: "Zoro", qty: 2 }] }),
  deck(2, { leader_card_id: "OP05-060", leader_name: "Monkey D. Luffy", cards: [{ card_id: "OP01-016", name: "Nami", qty: 1 }] }),
  deck(3, { leader_card_id: "OP02-001", leader_name: "Whitebeard", cards: [{ card_id: "OP01-018", name: "Sanji", qty: 3 }] }),
];

describe("findDecksWithCard (#1315)", () => {
  it("an empty or blank query does not filter (#1315)", () => {
    expect(findDecksWithCard(decks, "")).toBeNull();
    expect(findDecksWithCard(decks, "   ")).toBeNull();
  });

  it("lists only decks that contain the card, each with its own copy count (#1315)", () => {
    const hits = findDecksWithCard(decks, "nami")!;
    expect(hits.map((h) => h.deck.id)).toEqual([1, 2]);
    expect(hits.map((h) => h.cards.map((c) => c.qty))).toEqual([[4], [1]]);
    expect(hits[0].cards).toEqual([{ card_id: "OP01-016", name: "Nami", qty: 4 }]);
  });

  it("matches the card name by case-insensitive substring after trimming (#1315)", () => {
    expect(findDecksWithCard(decks, "  ZOR ")!.map((h) => h.deck.id)).toEqual([1]);
  });

  it("matches a card id with or without the dash, in any case (#1315)", () => {
    expect(findDecksWithCard(decks, "op01016")!.map((h) => h.deck.id)).toEqual([1, 2]);
    expect(findDecksWithCard(decks, "OP01-016")!.map((h) => h.deck.id)).toEqual([1, 2]);
    expect(findDecksWithCard(decks, "op01 018")!.map((h) => h.deck.id)).toEqual([3]);
  });

  it("a Leader match is flagged and does not list main-deck cards (#1315)", () => {
    const hits = findDecksWithCard(decks, "whitebeard")!;
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ leaderMatches: true, cards: [] });
    const byId = findDecksWithCard(decks, "OP05060")!;
    expect(byId.map((h) => h.deck.id)).toEqual([2]);
    expect(byId[0].leaderMatches).toBe(true);
  });

  it("a deck whose Leader matches but cards do not is not flagged for cards (#1315)", () => {
    const hits = findDecksWithCard(decks, "luffy")!;
    expect(hits.map((h) => [h.deck.id, h.leaderMatches, h.cards.length])).toEqual([[1, true, 0], [2, true, 0]]);
  });

  it("no match anywhere gives an empty list, not null (#1315)", () => {
    expect(findDecksWithCard(decks, "xyz")).toEqual([]);
  });

  it("a deck from an older API without cards never matches a card (#1315)", () => {
    const old = deck(9, { cards: undefined });
    expect(findDecksWithCard([old], "nami")).toEqual([]);
  });
});
