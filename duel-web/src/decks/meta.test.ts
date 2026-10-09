import { beforeEach, describe, expect, it } from "vitest";
import fixture from "./metaDecks.fixture.json";
import {
  addMetaDeck,
  deckSignature,
  findSavedCopy,
  formatDeckRow,
  groupByCost,
  metaDeckName,
  ordinal,
  type MetaDeck,
} from "./meta";
import { getSavedDeck, saveDeck } from "./storage";

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

describe("meta deck names (#443)", () => {
  it("ordinals use th for 11 to 13 and st/nd/rd otherwise (#443)", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th",
    ]);
  });

  it("names a deck with leader, ordinal placing and event (#443)", () => {
    expect(metaDeckName("Silvers Rayleigh", "OP12-001", "Weekly Cup", 1)).toBe("Silvers Rayleigh – 1st Weekly Cup");
  });

  it("omits the placing when there is none and falls back to the leader id (#443)", () => {
    expect(metaDeckName("", "OP12-001", "Weekly Cup", null)).toBe("OP12-001 – Weekly Cup");
  });

  it("trims long names to the planner's name limit (#443)", () => {
    const name = metaDeckName("Leader", "OP12-001", "E".repeat(500), 2);
    expect(name).toHaveLength(200);
    expect(name.startsWith("Leader – 2nd EEE")).toBe(true);
  });
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

function addMetaDeckCards(deck: MetaDeck): string[] {
  return deck.cards.flatMap((c) => Array.from({ length: c.count }, () => c.card_id));
}
