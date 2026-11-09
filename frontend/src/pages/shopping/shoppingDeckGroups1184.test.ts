import { describe, expect, it } from "vitest";
import type { DeckSummary } from "../../api";
import {
  groupDecksByLeader,
  groupState,
  otherChipSummary,
  showExtraCopiesChip,
  toggleGroupDecks,
} from "./shoppingDeckGroups";

const deck = (id: number, sort_order: number, leader: string | null, name?: string | null) =>
  ({ id, name: `D${id}`, sort_order, leader_card_id: leader, leader_name: name }) as DeckSummary;

describe("Include decks grouped by leader (#1184)", () => {
  it("makes one group per leader, ordered by each leader's earliest deck, decks in their order", () => {
    // Luffy and Zoro decks interleave; Zoro's earliest deck (sort 0) comes before Luffy's (sort 1).
    const groups = groupDecksByLeader([
      deck(10, 0, "OP01-025", "Zoro"),
      deck(11, 1, "OP01-001", "Luffy"),
      deck(12, 4, "OP01-025", "Zoro"),
      deck(13, 3, "OP01-001", "Luffy"),
    ]);
    expect(groups.map((g) => [g.label, g.decks.map((d) => d.id)])).toEqual([
      ["Zoro", [10, 12]],
      ["Luffy", [11, 13]],
    ]);
  });

  it("orders groups by sort_order, not by the order the decks were listed", () => {
    const groups = groupDecksByLeader([deck(1, 5, "B-1", "Bee"), deck(2, 2, "A-1", "Ay")]);
    expect(groups.map((g) => g.label)).toEqual(["Ay", "Bee"]);
  });

  it("falls back to the leader id, then to No leader", () => {
    const groups = groupDecksByLeader([deck(1, 0, "OP01-001"), deck(2, 1, null), deck(3, 2, "OP02-002", "")]);
    expect(groups.map((g) => g.label)).toEqual(["OP01-001", "No leader", "OP02-002"]);
  });

  it("reports a group as all, some or none ticked", () => {
    expect(groupState([1, 2], [1, 2, 3])).toBe("all");
    expect(groupState([1, 2], [2])).toBe("some");
    expect(groupState([1, 2], [3])).toBe("none");
  });

  it("ticks every deck of the leader when only some are ticked", () => {
    expect(toggleGroupDecks([1, 5], [1, 2, 3])).toEqual([1, 5, 2, 3]);
  });

  it("unticks the whole leader when all its decks are ticked, leaving other decks alone", () => {
    expect(toggleGroupDecks([1, 2, 5], [1, 2])).toEqual([5]);
  });

  it("keeps at least one deck ticked", () => {
    expect(toggleGroupDecks([1, 2], [1, 2])).toEqual([1, 2]);
  });
});

describe("Extra copies chip (#1184)", () => {
  it("shows with Extra copies or while off, and stays hidden otherwise", () => {
    expect(showExtraCopiesChip(true, true)).toBe(true);
    expect(showExtraCopiesChip(false, false)).toBe(true);
    expect(showExtraCopiesChip(false, true)).toBe(false);
  });

  it("names what is switched off in the filter summary", () => {
    expect(otherChipSummary(true, true)).toEqual([]);
    expect(otherChipSummary(false, true)).toEqual(["No added cards"]);
    expect(otherChipSummary(true, false)).toEqual(["No extra copies"]);
  });
});
