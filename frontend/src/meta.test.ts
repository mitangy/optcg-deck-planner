import { describe, expect, it, vi } from "vitest";
import type { MetaDeckCard } from "./api";
import { createMetaDeck, groupCardsByCost } from "./meta";

describe("meta cost groups", () => {
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
