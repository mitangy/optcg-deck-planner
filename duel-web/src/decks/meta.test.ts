import { beforeEach, describe, expect, it } from "vitest";
import fixture from "./metaDecks.fixture.json";
import {
  addMetaDeck,
  deckSignature,
  findSavedCopy,
  formatDeckRow,
  groupByCost,
  metaDeckName,
  playMetaDeck,
  type MetaDeck,
} from "./meta";
import { getSavedDeck, getSelectedDeckId, listSavedDecks, saveDeck } from "./storage";

const decks = fixture.decks as MetaDeck[];
const first = decks[0];
const leader = { leaderId: fixture.leader_id, name: fixture.name };

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

describe("meta deck rows (#443)", () => {
  it("formats placing, field size, event, date and record (#443)", () => {
    const deck = { ...first, placing: 1, players: 64, event: "Weekly Cup", date: "2026-10-05", record: { wins: 6, losses: 1, ties: 2 } };
    expect(formatDeckRow(deck)).toBe("1st of 64 · Weekly Cup · Oct 5 · 6-1-2");
  });

  it("falls back to the player count when the deck has no placing (#443)", () => {
    expect(formatDeckRow({ ...first, placing: null, players: 32 })).toContain("32 players · ");
  });

  it("groups the card list by cost with unpriced cards last (#443)", () => {
    const card = (id: string, cost: string) => ({ card_id: id, count: 1, name: id, cost, card_type: "", image_url: "" });
    const groups = groupByCost([card("A", "10"), card("B", ""), card("C", "2"), card("D", "2")]);
    expect(groups.map((g) => [g.cost, g.cards.length])).toEqual([["2", 2], ["10", 1], ["", 1]]);
  });
});

describe("Add to my decks (#443)", () => {
  it("saves the deck's leader and its 50 main cards from the paste text (#443)", () => {
    const result = addMetaDeck(leader, first);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const saved = getSavedDeck(result.deck.id)!;
    expect(saved.leaderId).toBe("OP17-039");
    expect(saved.cards).toHaveLength(50);
    expect(saved.cards.filter((c) => c === "OP17-055")).toHaveLength(4);
    expect(saved.name).toBe(`${fixture.name} – 1st ${first.event}`);
  });
});

describe("duplicate detection (#443)", () => {
  it("finds a saved deck with the same leader and cards in any order (#443)", () => {
    const cards = [...addMetaDeckCards(first)].reverse();
    const saved = saveDeck({ name: "Mine", leaderId: "OP17-039", cards });
    expect(findSavedCopy([saved], "OP17-039", first)?.id).toBe(saved.id);
  });

  it("does not match a deck with one card swapped or a different leader (#443)", () => {
    const cards = addMetaDeckCards(first);
    const swapped = saveDeck({ name: "Swapped", leaderId: "OP17-039", cards: [...cards.slice(1), "OP01-016"] });
    const otherLeader = saveDeck({ name: "Other", leaderId: "OP12-001", cards });
    expect(findSavedCopy([swapped, otherLeader], "OP17-039", first)).toBeUndefined();
  });

  it("signatures ignore case and order but not leader (#443)", () => {
    expect(deckSignature("op17-039", ["b", "A"])).toBe(deckSignature("OP17-039", ["a", "B"]));
    expect(deckSignature("OP17-039", ["A"])).not.toBe(deckSignature("OP12-001", ["A"]));
  });
});

describe("Play this deck online (#914)", () => {
  it("saves the chosen list as a deck and makes it the one the lobby plays (#914)", () => {
    const chosen = decks[1];
    const result = playMetaDeck(leader, chosen);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(getSelectedDeckId()).toBe(result.deckId);
    const saved = getSavedDeck(result.deckId)!;
    expect(saved.leaderId).toBe("OP17-039");
    expect(deckSignature(saved.leaderId, saved.cards)).toBe(deckSignature("OP17-039", addMetaDeckCards(chosen)));
    expect(saved.name).toBe(metaDeckName(fixture.name, "OP17-039", chosen));
  });

  it("playing the same list twice reuses the saved copy and selects it again (#914)", () => {
    const a = playMetaDeck(leader, first);
    playMetaDeck(leader, decks[1]);
    const b = playMetaDeck(leader, first);
    expect(a.ok && b.ok && a.deckId === b.deckId).toBe(true);
    expect(listSavedDecks()).toHaveLength(2);
    expect(getSelectedDeckId()).toBe(b.ok ? b.deckId : null);
  });

  it("a list that cannot be imported selects nothing and says why (#914)", () => {
    const result = playMetaDeck(leader, { ...first, text: "not a decklist" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
    expect(getSelectedDeckId()).toBeNull();
    expect(listSavedDecks()).toHaveLength(0);
  });
});

function addMetaDeckCards(deck: MetaDeck): string[] {
  return deck.cards.flatMap((c) => Array.from({ length: c.count }, () => c.card_id));
}
