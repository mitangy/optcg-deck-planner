import { describe, expect, it, vi } from "vitest";
import type { MetaDeck, MetaDeckCard, MetaLeader } from "../api";
import { META_MIN_DECKS_FOR_WIN_RATE, createMetaDeck, distinctiveCards, fewDecksNote, filterSortLeaders, groupCardsByCost, hasFewDecks, leaderSubtitle, parseMetaSort } from "./meta";

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

const leader = (id: string, o: Partial<MetaLeader>): MetaLeader => ({
  leader_id: id, name: id, color: "Red", image_url: "", decks: 100, share: 0.05, top8: 10, wins: 0, losses: 0, ties: 0, win_rate: 0.5, ...o,
});
const ids = (ls: MetaLeader[]) => ls.map((l) => l.leader_id);

describe("filterSortLeaders (#1359)", () => {
  const all = [
    leader("OP01-001", { name: "Zoro", color: "Green", share: 0.1, decks: 50, top8: 5, win_rate: 0.5 }),
    leader("ST30-001", { name: "Luffy & Ace", color: "Green;Red", share: 0.2, decks: 30, top8: 9, win_rate: 0.6 }),
    leader("OP09-062", { name: "Nico Robin", color: "Purple;Yellow", share: 0.05, decks: 90, top8: 20, win_rate: 0.4 }),
  ];
  const base = { q: "", colors: [], sort: "share" as const };

  it("search matches a name or an ID, ignoring case and padding (#1359)", () => {
    expect(ids(filterSortLeaders(all, { ...base, q: " nICO " }))).toEqual(["OP09-062"]);
    expect(ids(filterSortLeaders(all, { ...base, q: "st30" }))).toEqual(["ST30-001"]);
    expect(filterSortLeaders(all, { ...base, q: "nobody" })).toEqual([]);
  });

  it("a two-colour leader matches when any one of its colours is picked (#1359)", () => {
    expect(ids(filterSortLeaders(all, { ...base, colors: ["Red"] }))).toEqual(["ST30-001"]);
    expect(ids(filterSortLeaders(all, { ...base, colors: ["yellow", "Green"] }))).toEqual(["ST30-001", "OP01-001", "OP09-062"]);
  });

  it("sorts descending by the chosen stat (#1359)", () => {
    expect(ids(filterSortLeaders(all, base))).toEqual(["ST30-001", "OP01-001", "OP09-062"]);
    expect(ids(filterSortLeaders(all, { ...base, sort: "decks" }))).toEqual(["OP09-062", "OP01-001", "ST30-001"]);
    expect(ids(filterSortLeaders(all, { ...base, sort: "top8" }))).toEqual(["OP09-062", "ST30-001", "OP01-001"]);
  });

  it("an unknown sort in the URL falls back to share (#1359)", () => {
    expect(parseMetaSort("win_rate")).toBe("win_rate");
    expect(parseMetaSort("bogus")).toBe("share");
    expect(parseMetaSort(null)).toBe("share");
  });
});

describe("small-sample win rates (#1359)", () => {
  it("a leader is a small sample only below the threshold (#1359)", () => {
    expect(META_MIN_DECKS_FOR_WIN_RATE).toBe(20);
    expect(hasFewDecks({ decks: 19 })).toBe(true);
    expect(hasFewDecks({ decks: 20 })).toBe(false);
    expect(fewDecksNote({ decks: 13 })).toBe("Only 13 decks, so this win rate can swing a lot");
  });

  it("Win rate sort puts every small sample after the leaders with enough decks (#1359)", () => {
    const ls = [
      leader("LUCKY", { decks: 5, win_rate: 0.9 }),
      leader("GOOD", { decks: 40, win_rate: 0.55 }),
      leader("OK", { decks: 20, win_rate: 0.5 }),
      leader("TINY2", { decks: 3, win_rate: 0.7 }),
      leader("NONE", { decks: 60, win_rate: null }),
    ];
    expect(ids(filterSortLeaders(ls, { q: "", colors: [], sort: "win_rate" }))).toEqual(["GOOD", "OK", "NONE", "LUCKY", "TINY2"]);
  });
});

describe("leaderSubtitle (#1359)", () => {
  it("shows the leader's own decks and top 8, else only the window (#1359)", () => {
    expect(leaderSubtitle({ decks: 216, top8: 37 }, 30)).toBe("216 decks · 37 top 8 · last 30 days");
    expect(leaderSubtitle(undefined, 7)).toBe("last 7 days");
  });
});

describe("distinctiveCards (#1359)", () => {
  const c = (card_id: string, count: number): MetaDeckCard => ({ card_id, count, name: card_id, cost: "1", card_type: "Character", image_url: "" });
  const d = (...cards: MetaDeckCard[]) => ({ cards }) as Pick<MetaDeck, "cards">;

  it("lists only cards in fewer than half the lists, rarest first, then more copies, then id (#1359)", () => {
    const mine = d(c("EVERY", 4), c("HALF", 4), c("MID", 4), c("A-ONE", 1), c("B-TWO", 2), c("C-TWO", 2));
    const lists = [
      mine,
      d(c("EVERY", 4), c("HALF", 4), c("MID", 4)),
      d(c("EVERY", 4), c("HALF", 4)),
      d(c("EVERY", 4)),
      d(c("EVERY", 4)),
    ];
    // presence: EVERY 1, HALF .6 (not shown), MID .4, the other three .2
    expect(distinctiveCards(mine, lists).map((x) => x.card_id)).toEqual(["B-TWO", "C-TWO", "A-ONE", "MID"]);
  });

  it("a card at exactly half the lists is not distinctive and the result is capped (#1359)", () => {
    const mine = d(c("HALF", 4), c("X1", 1), c("X2", 1), c("X3", 1));
    const lists = [mine, d(c("HALF", 4)), d(), d()];
    const out = distinctiveCards(mine, lists).map((x) => x.card_id);
    expect(out).toEqual(["X1", "X2", "X3"]);
    expect(distinctiveCards(mine, lists, 2)).toHaveLength(2);
  });
});
