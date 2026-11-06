import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyPlannerDeepLink,
  importPlannerDeckDetail,
  importPlannerDecks,
  plannerDeckArt,
  parsePlannerDeepLink,
  plannerDeckImported,
  plannerDecksNotLocal,
  plannerDeckToDecklist,
  refreshLinkedDeck,
  saveDeckToPlanner,
  savedDeckToPlannerList,
  type PlannerDeckDetail,
} from "./planner";
import { getSavedDeck, listSavedDecks, saveDeck, setDeckArtPref, upsertPlannerDeck } from "./storage";

const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => {
      memory.set(k, String(v));
    },
    removeItem: (k) => {
      memory.delete(k);
    },
    clear: () => memory.clear(),
    key: () => null,
    get length() {
      return memory.size;
    },
  };
});

afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

function detail(over: Partial<PlannerDeckDetail> = {}): PlannerDeckDetail {
  return {
    id: 7,
    name: "Red Luffy",
    leader_card_id: "ST01-001",
    cards: [
      { card_id: "ST01-001", card_type: "Leader", needed: 1 },
      { card_id: "ST01-003", card_type: "Character", needed: 4 },
      { card_id: "ST01-006", card_type: "Character", needed: 2 },
      { card_id: "DON-RED", card_type: "DON!!", section: "don", needed: 10 },
    ],
    ...over,
  };
}

describe("plannerDeckToDecklist", () => {
  it("lists the leader once, keeps main counts, and drops DON!!", () => {
    const lines = plannerDeckToDecklist(detail()).split("\n");
    expect(lines).toEqual(["1xST01-001", "4xST01-003", "2xST01-006"]);
  });

  it("drops DON!! rows identified only by card_type", () => {
    const text = plannerDeckToDecklist(
      detail({ cards: [{ card_id: "DON-X", card_type: "DON!!", needed: 10 }, { card_id: "ST01-003", needed: 3 }] }),
    );
    expect(text).toBe("1xST01-001\n3xST01-003");
  });

  it("skips cards that are not needed", () => {
    const text = plannerDeckToDecklist(detail({ cards: [{ card_id: "ST01-003", needed: 0 }] }));
    expect(text).toBe("1xST01-001");
  });
});

describe("savedDeckToPlannerList", () => {
  it("writes one leader line and a count line per distinct card", () => {
    expect(savedDeckToPlannerList({ leaderId: "ST01-001", cards: ["ST01-003", "ST01-006", "ST01-003"] })).toBe(
      "1xST01-001\n2xST01-003\n1xST01-006",
    );
  });
});

describe("upsertPlannerDeck", () => {
  const text = "1xST01-001\n4xST01-003";

  it("creates a linked local copy under a stable id and updates it in place", () => {
    const first = upsertPlannerDeck({ plannerId: 7, name: "A", text });
    expect(first.ok && first.deck.id).toBe("planner-7");
    expect(getSavedDeck("planner-7")?.plannerDeckId).toBe(7);
    upsertPlannerDeck({ plannerId: 7, name: "B", text: "1xST01-001\n3xST01-003" });
    const deck = getSavedDeck("planner-7")!;
    expect(deck.name).toBe("B");
    expect(deck.cards).toHaveLength(3);
  });

  it("keeps art prefs only for cards still in the deck", () => {
    saveDeck({
      id: "planner-7",
      name: "A",
      leaderId: "ST01-001",
      cards: ["ST01-003"],
      artPrefs: { "ST01-003": "p1", "ST01-006": "p2" },
      plannerDeckId: 7,
    });
    upsertPlannerDeck({ plannerId: 7, name: "A", text });
    expect(getSavedDeck("planner-7")?.artPrefs).toEqual({ "ST01-003": "p1" });
  });

  it("does not write an invalid deck", () => {
    const r = upsertPlannerDeck({ plannerId: 9, name: "Bad", text: "4xST01-003" });
    expect(r.ok).toBe(false);
    expect(getSavedDeck("planner-9")).toBeUndefined();
  });
});

describe("saveDeck planner link", () => {
  it("keeps the planner link across later edits", () => {
    saveDeck({ id: "d", name: "x", leaderId: "ST01-001", cards: [], plannerDeckId: 3 });
    saveDeck({ id: "d", name: "x2", leaderId: "ST01-001", cards: ["ST01-003"] });
    expect(getSavedDeck("d")?.plannerDeckId).toBe(3);
  });
});

describe("editedLocally (#481)", () => {
  it("is cleared when the planner version replaces the deck, and kept by plain saves", () => {
    saveDeck({ id: "planner-7", name: "A", leaderId: "ST01-001", cards: ["ST01-003"], plannerDeckId: 7, editedLocally: true });
    saveDeck({ id: "planner-7", name: "A2", leaderId: "ST01-001", cards: ["ST01-003", "ST01-006"] });
    expect(getSavedDeck("planner-7")?.editedLocally).toBe(true);
    upsertPlannerDeck({ plannerId: 7, name: "A", text: "1xST01-001\n3xST01-003" });
    expect(getSavedDeck("planner-7")?.editedLocally).toBe(false);
  });
});

describe("refreshLinkedDeck", () => {
  const linked = () =>
    saveDeck({ id: "planner-7", name: "Old", leaderId: "ST01-001", cards: [], plannerDeckId: 7 });

  it("replaces the local copy with the fresh planner deck", async () => {
    const deck = await refreshLinkedDeck(linked(), 100, async () => detail());
    expect(deck.cards).toHaveLength(6);
    expect(getSavedDeck("planner-7")?.name).toBe("Red Luffy");
  });

  it("refreshes a deck saved to the planner in place instead of duplicating it", async () => {
    const saved = saveDeck({
      id: "local-uuid",
      name: "Mine",
      leaderId: "ST01-001",
      cards: ["ST01-003"],
      artPrefs: { "ST01-003": "p1" },
      plannerDeckId: 42,
    });
    const deck = await refreshLinkedDeck(saved, 100, async () => detail({ id: 42 }));
    expect(deck.id).toBe("local-uuid");
    const original = getSavedDeck("local-uuid")!;
    expect(original.cards).toHaveLength(6);
    expect(original.name).toBe("Red Luffy");
    expect(original.artPrefs).toEqual({ "ST01-003": "p1" });
    expect(listSavedDecks().filter((d) => d.plannerDeckId === 42).map((d) => d.id)).toEqual(["local-uuid"]);
  });

  it("keeps the local copy when the fetch fails", async () => {
    const local = linked();
    const deck = await refreshLinkedDeck(local, 100, async () => {
      throw new Error("offline");
    });
    expect(deck).toBe(local);
    expect(getSavedDeck("planner-7")?.name).toBe("Old");
  });

  it("keeps the local copy when the planner deck is invalid for duel", async () => {
    const local = linked();
    const deck = await refreshLinkedDeck(local, 100, async () => detail({ leader_card_id: null, cards: [{ card_id: "ST01-003", needed: 4 }] }));
    expect(deck).toBe(local);
  });

  it("keeps a linked deck you saved edits to and does not fetch (#481)", async () => {
    const edited = saveDeck({ id: "planner-7", name: "Old", leaderId: "ST01-001", cards: ["ST01-003"], plannerDeckId: 7, editedLocally: true });
    let called = false;
    const deck = await refreshLinkedDeck(edited, 100, async () => {
      called = true;
      return detail();
    });
    expect(called).toBe(false);
    expect(deck.cards).toEqual(["ST01-003"]);
    expect(getSavedDeck("planner-7")?.cards).toEqual(["ST01-003"]);
  });

  it("does not fetch for an unlinked deck", async () => {
    const plain = saveDeck({ id: "p", name: "p", leaderId: "ST01-001", cards: [] });
    let called = false;
    await refreshLinkedDeck(plain, 100, async () => {
      called = true;
      return detail();
    });
    expect(called).toBe(false);
  });
});

describe("parsePlannerDeepLink", () => {
  it("reads the planner id and the hash fallback", () => {
    const hash = `#list=${encodeURIComponent("1xST01-001\n4xST01-003")}&name=${encodeURIComponent("My & deck")}`;
    expect(parsePlannerDeepLink("?planner=12", hash)).toEqual({
      plannerId: 12,
      list: "1xST01-001\n4xST01-003",
      name: "My & deck",
    });
  });

  it("ignores a non-numeric planner id and returns null with nothing usable", () => {
    expect(parsePlannerDeepLink("?planner=abc", "")).toBeNull();
    expect(parsePlannerDeepLink("", "")).toBeNull();
  });
});

describe("applyPlannerDeepLink", () => {
  const link = { plannerId: 7, list: "1xST01-001\n4xST01-003", name: "From hash" };

  it("imports the planner deck when signed in", async () => {
    const r = await applyPlannerDeepLink(link, true, async () => detail());
    expect(r.ok && r.deck.id).toBe("planner-7");
  });

  it("falls back to the list when signed out, without calling the API", async () => {
    let called = false;
    const r = await applyPlannerDeepLink(link, false, async () => {
      called = true;
      return detail();
    });
    expect(called).toBe(false);
    expect(r.ok && r.deck.name).toBe("From hash");
    expect(r.ok && r.deck.plannerDeckId).toBeUndefined();
  });

  it("falls back to the list when the fetch fails", async () => {
    const r = await applyPlannerDeepLink(link, true, async () => {
      throw new Error("404");
    });
    expect(r.ok && r.deck.name).toBe("From hash");
  });

  it("reports an error when there is nothing to fall back on", async () => {
    const r = await applyPlannerDeepLink({ plannerId: 7, list: null, name: "x" }, false);
    expect(r.ok).toBe(false);
  });
});

describe("plannerDecksNotLocal", () => {
  const summary = (id: number) => ({ id, name: `D${id}`, leader_card_id: "ST01-001", card_count: 50 });

  it("hides planner decks that already have a linked copy, keeping the rest in order", () => {
    const local = [{ plannerDeckId: 2 }, { plannerDeckId: undefined }, { plannerDeckId: 9 }];
    expect(plannerDecksNotLocal([summary(1), summary(2), summary(3)], local).map((d) => d.id)).toEqual([1, 3]);
  });
});

describe("importPlannerDecks", () => {
  it("adds every deck that loads, even when another fails or is invalid", async () => {
    const r = await importPlannerDecks(
      [
        { id: 7, name: "Red Luffy" },
        { id: 8, name: "Offline" },
        { id: 9, name: "No leader" },
        { id: 10, name: "Green" },
      ],
      async (id) => {
        if (id === 8) throw new Error("timeout");
        if (id === 9) return detail({ id, leader_card_id: null, cards: [{ card_id: "ST01-003", needed: 4 }] });
        return detail({ id, name: id === 10 ? "Green" : "Red Luffy" });
      },
    );
    expect(r.imported.map((d) => d.id)).toEqual(["planner-7", "planner-10"]);
    expect(getSavedDeck("planner-10")?.plannerDeckId).toBe(10);
    expect(getSavedDeck("planner-9")).toBeUndefined();
    expect(r.errors).toHaveLength(2);
    expect(r.errors[0]).toBe("Offline: timeout");
    expect(r.errors[1]).toMatch(/^No leader: /);
  });
});

describe("plannerDeckImported", () => {
  it("is false for a swiped deck that failed while another ticked deck was added", async () => {
    const { imported } = await importPlannerDecks(
      [
        { id: 7, name: "Red Luffy" },
        { id: 9, name: "No leader" },
      ],
      async (id) =>
        id === 9 ? detail({ id, leader_card_id: null, cards: [{ card_id: "ST01-003", needed: 4 }] }) : detail({ id }),
    );
    expect(plannerDeckImported(imported, 9)).toBe(false);
    expect(plannerDeckImported(imported, 7)).toBe(true);
  });
});

describe("alt arts picked in the planner (#1003)", () => {
  // OP09-118: p1 = product 597065, p2 = 597066. OP09-093: p1 = 597035, p2 = 597036.
  const alts118 = [
    { product_id: 597065, owned: 1 },
    { product_id: 597066, owned: 3 },
  ];
  const withArt = (cards: PlannerDeckDetail["cards"]) =>
    detail({ cards: [{ card_id: "ST01-001", card_type: "Leader", needed: 1 }, ...cards] });

  it("carries an explicit planner pick", () => {
    const d = withArt([{ card_id: "OP09-118", needed: 4, alt_arts: alts118, display_art: 597065 }]);
    expect(importPlannerDeckDetail(d).ok).toBe(true);
    expect(getSavedDeck("planner-7")?.artPrefs).toEqual({ "OP09-118": "p1" });
  });

  it("uses the most-owned alt when the planner is on automatic, even when it is not the first (#1003)", () => {
    const d = withArt([{ card_id: "OP09-118", needed: 4, alt_arts: alts118, display_art: null }]);
    importPlannerDeckDetail(d);
    expect(getSavedDeck("planner-7")?.artPrefs).toEqual({ "OP09-118": "p2" });
  });

  it("falls back to the owned alt when the picked product is not listed", () => {
    const d = withArt([{ card_id: "OP09-118", needed: 4, alt_arts: alts118, display_art: 111 }]);
    importPlannerDeckDetail(d);
    expect(getSavedDeck("planner-7")?.artPrefs).toEqual({ "OP09-118": "p2" });
  });

  it("keeps base art when the planner chose base, even with an alt owned", () => {
    const d = withArt([{ card_id: "OP09-118", needed: 4, alt_arts: alts118, display_art: 0 }]);
    importPlannerDeckDetail(d);
    expect(getSavedDeck("planner-7")?.artPrefs).toBeUndefined();
  });

  it("carries nothing for a product the duel card has no alt for, or when no alt is owned", () => {
    const d = withArt([
      { card_id: "OP09-118", needed: 4, alt_arts: [{ product_id: 1, owned: 5 }], display_art: null },
      { card_id: "OP09-093", needed: 2, alt_arts: [{ product_id: 597036, owned: 0 }], display_art: null },
    ]);
    importPlannerDeckDetail(d);
    expect(getSavedDeck("planner-7")?.artPrefs).toBeUndefined();
  });

  it("carries the leader's art too", () => {
    const d = detail({
      leader_card_id: "OP17-001",
      cards: [
        { card_id: "OP17-001", card_type: "Leader", needed: 1, alt_arts: [{ product_id: 705924 }], display_art: 705924 },
        { card_id: "OP09-118", needed: 4, alt_arts: alts118, display_art: 597066 },
      ],
    });
    importPlannerDeckDetail(d);
    expect(getSavedDeck("planner-7")?.artPrefs).toEqual({ "OP17-001": "p1", "OP09-118": "p2" });
  });

  it("a pick made in duel survives a later pull, and so does picking base", () => {
    const pull = (display_art: number) =>
      importPlannerDeckDetail(withArt([
        { card_id: "OP09-118", needed: 4, alt_arts: alts118, display_art },
        { card_id: "OP09-093", needed: 2, alt_arts: [{ product_id: 597036 }, { product_id: 597035 }], display_art: 597036 },
      ]));
    pull(597065);
    expect(getSavedDeck("planner-7")?.artPrefs).toEqual({ "OP09-118": "p1", "OP09-093": "p2" });
    setDeckArtPref("planner-7", "OP09-118", "p2"); // changed in duel
    setDeckArtPref("planner-7", "OP09-093", null); // back to base in duel
    pull(597065);
    pull(597065);
    expect(getSavedDeck("planner-7")?.artPrefs).toEqual({ "OP09-118": "p2" });
  });

  it("a planner change propagates when the player has not changed that card", () => {
    const pull = (display_art: number) =>
      importPlannerDeckDetail(withArt([{ card_id: "OP09-118", needed: 4, alt_arts: alts118, display_art }]));
    pull(597065);
    pull(597066);
    expect(getSavedDeck("planner-7")?.artPrefs).toEqual({ "OP09-118": "p2" });
    pull(0);
    expect(getSavedDeck("planner-7")?.artPrefs).toBeUndefined();
    expect(getSavedDeck("planner-7")?.plannerArt).toBeUndefined();
  });

  it("keeps the prefs of a deck that never had planner art", () => {
    saveDeck({ id: "planner-7", name: "A", leaderId: "ST01-001", cards: ["OP09-118"], artPrefs: { "OP09-118": "p1" }, plannerDeckId: 7 });
    importPlannerDeckDetail(withArt([{ card_id: "OP09-118", needed: 4, alt_arts: alts118, display_art: 597066 }]));
    expect(getSavedDeck("planner-7")?.artPrefs).toEqual({ "OP09-118": "p1" });
  });

  it("drops art for cards that left the deck", () => {
    importPlannerDeckDetail(withArt([{ card_id: "OP09-118", needed: 4, alt_arts: alts118, display_art: 597066 }]));
    setDeckArtPref("planner-7", "OP09-118", "p1");
    importPlannerDeckDetail(withArt([{ card_id: "ST01-003", needed: 4 }]));
    const deck = getSavedDeck("planner-7")!;
    expect(deck.artPrefs).toBeUndefined();
    expect(deck.plannerArt).toBeUndefined();
  });
});

describe("Add a duel deck to the planner with its alt arts (#1017)", () => {
  // OP09-118: p2 = product 597066. OP09-093 has alts too but this deck leaves it on base art.
  const mk = () =>
    saveDeck({
      name: "Art deck",
      leaderId: "ST01-001",
      cards: ["OP09-118", "OP09-118", "OP09-093", "ST01-003"],
      artPrefs: { "OP09-118": "p2" },
    });
  const summary = (id: number) => ({ id, name: "Art deck", leader_card_id: "ST01-001", card_count: 5 });

  it("sets the planner art for an alt-art card, not for base-art cards, and records it in plannerArt (#1017)", async () => {
    const puts: [string, number][] = [];
    const r = await saveDeckToPlanner(mk(), {
      create: async () => summary(42),
      setArt: async (id, product) => void puts.push([id, product]),
    });
    expect(puts).toEqual([["OP09-118", 597066]]);
    expect(r.deck.plannerArt).toEqual({ "OP09-118": "p2" });
    expect([r.artsSet, r.artsFailed]).toEqual([1, 0]);
  });

  it("a failing art request does not fail the save and is left out of plannerArt (#1017)", async () => {
    const deck = mk();
    saveDeck({ id: deck.id, name: deck.name, leaderId: deck.leaderId, cards: deck.cards, artPrefs: { "OP09-118": "p2", "OP09-093": "p1" } });
    const r = await saveDeckToPlanner(getSavedDeck(deck.id)!, {
      create: async () => summary(42),
      setArt: async (id) => {
        if (id === "OP09-118") throw new Error("boom");
      },
    });
    expect(r.deck.plannerDeckId).toBe(42);
    expect(r.deck.plannerArt).toEqual({ "OP09-093": "p1" });
    expect([r.artsSet, r.artsFailed]).toEqual([1, 1]);
  });

  it("the local copy keeps its art picks and links to the planner deck (#1017)", async () => {
    const deck = mk();
    await saveDeckToPlanner(deck, { create: async () => summary(42), setArt: async () => ({}) });
    const local = getSavedDeck(deck.id)!;
    expect(local.artPrefs).toEqual({ "OP09-118": "p2" });
    expect(local.plannerDeckId).toBe(42);
    expect(listSavedDecks()).toHaveLength(1);
  });
});
