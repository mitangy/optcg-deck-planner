import { describe, expect, it, vi } from "vitest";
import type { MetaDeckCard } from "./api";
import { createMetaDeck, DECK_NAME_MAX, formatDeckRow, formatMetaDate, formatPercent, groupCardsByCost, metaDeckName, ordinal } from "./meta";

describe("meta deck naming and rows", () => {
  it("ordinals use th for 11-13 and st/nd/rd otherwise (#443)", () => {
    expect([1, 2, 3, 4, 8, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "8th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th",
    ]);
  });

  it("deck name is leader, placing ordinal, event; falls back to the leader id and drops a missing placing (#443)", () => {
    expect(metaDeckName("Silvers Rayleigh", "OP12-001", { placing: 1, event: "Weekly Cup" })).toBe("Silvers Rayleigh – 1st Weekly Cup");
    expect(metaDeckName("Silvers Rayleigh", "OP12-001", { placing: null, event: "Weekly Cup" })).toBe("Silvers Rayleigh – Weekly Cup");
    expect(metaDeckName("", "OP12-001", { placing: 12, event: "Weekly Cup" })).toBe("OP12-001 – 12th Weekly Cup");
  });

  it("deck name is trimmed to the API name limit (#443)", () => {
    const name = metaDeckName("Luffy", "OP01-001", { placing: 2, event: "x".repeat(500) });
    expect(name).toHaveLength(DECK_NAME_MAX);
    expect(name.startsWith("Luffy – 2nd x")).toBe(true);
  });

  it("deck row reads placing of players, date, then record (#443)", () => {
    const record = { wins: 7, losses: 0, ties: 0 };
    expect(formatDeckRow({ placing: 1, players: 128, date: "2026-09-28", record })).toBe("1st of 128 · Sep 28 · 7-0-0");
    expect(formatDeckRow({ placing: null, players: 64, date: "2026-10-05", record: { wins: 4, losses: 2, ties: 1 } })).toBe("64 players · Oct 5 · 4-2-1");
  });

  it("dates read as the written month and day (#443)", () => {
    expect(formatMetaDate("2026-01-01")).toBe("Jan 1");
    expect(formatMetaDate("2026-12-31")).toBe("Dec 31");
  });

  it("percentages show one decimal and a dash when there are no games (#443)", () => {
    expect(formatPercent(0.081)).toBe("8.1%");
    expect(formatPercent(0.5346)).toBe("53.5%");
    expect(formatPercent(null)).toBe("–");
  });

  it("cards group by numeric cost ascending with non-numeric costs last (#443)", () => {
    const card = (card_id: string, cost: string): MetaDeckCard => ({ card_id, count: 1, name: card_id, cost, card_type: "Character", image_url: "" });
    const groups = groupCardsByCost([card("A", "10"), card("B", "2"), card("C", ""), card("D", "2"), card("E", "0")]);
    expect(groups.map((g) => [g.label, g.cards.map((c) => c.card_id)])).toEqual([
      ["Cost 0", ["E"]],
      ["Cost 2", ["B", "D"]],
      ["Cost 10", ["A"]],
      ["Other", ["C"]],
    ]);
  });
});

describe("createMetaDeck", () => {
  it("posts the deck's text and generated name, refreshes decks, then opens the new deck (#443)", async () => {
    const calls: string[] = [];
    const createDeck = vi.fn(async (_name: string, _text: string) => {
      calls.push("create");
      return { id: 42 };
    });
    const onCreated = vi.fn(async () => {
      calls.push("invalidate");
    });
    const navigate = vi.fn((_path: string) => {
      calls.push("navigate");
    });
    const text = "1xOP12-001\n4xOP01-016\n";
    await createMetaDeck({ id: "OP12-001", name: "Silvers Rayleigh" }, { placing: 3, event: "Weekly Cup", text }, { createDeck, onCreated, navigate });
    expect(createDeck).toHaveBeenCalledWith("Silvers Rayleigh – 3rd Weekly Cup", text);
    expect(navigate).toHaveBeenCalledWith("/decks/42");
    expect(calls).toEqual(["create", "invalidate", "navigate"]);
  });
});
