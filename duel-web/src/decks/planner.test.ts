import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyPlannerDeepLink,
  importPlannerDeckDetail,
  parsePlannerDeepLink,
  plannerDeckToDecklist,
  pushDeckArtToPlanner,
  pushLinkedDeckArt,
  refreshLinkedDeck,
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

describe("refreshLinkedDeck", () => {
  // OP09-118: p1 = product 597065, p2 = 597066.
  const alts = [{ product_id: 597065 }, { product_id: 597066 }];
  const planner = (display_art: number) =>
    detail({
      cards: [
        { card_id: "ST01-001", card_type: "Leader", needed: 1 },
        { card_id: "OP09-118", needed: 4, alt_arts: alts, display_art },
      ],
    });
  const linked = () =>
    saveDeck({ id: "planner-7", name: "Mine", leaderId: "ST01-001", cards: ["OP09-118"], plannerDeckId: 7 });

  it("takes on the planner's shown art and leaves the cards and name alone", async () => {
    const deck = await refreshLinkedDeck(linked(), 100, async () => planner(597066));
    expect(deck.artPrefs).toEqual({ "OP09-118": "p2" });
    expect(getSavedDeck("planner-7")).toMatchObject({ name: "Mine", cards: ["OP09-118"], plannerArt: { "OP09-118": "p2" } });
  });

  it("keeps an art pick made here over a later planner change", async () => {
    await refreshLinkedDeck(linked(), 100, async () => planner(597065));
    setDeckArtPref("planner-7", "OP09-118", "p2");
    await refreshLinkedDeck(getSavedDeck("planner-7")!, 100, async () => planner(597065));
    expect(getSavedDeck("planner-7")?.artPrefs).toEqual({ "OP09-118": "p2" });
  });

  it("writes nothing when the art is already what the planner shows", async () => {
    const first = await refreshLinkedDeck(linked(), 100, async () => planner(597066));
    await new Promise((r) => setTimeout(r, 5));
    const again = await refreshLinkedDeck(first, 100, async () => planner(597066));
    expect(again.updatedAt).toBe(first.updatedAt);
  });

  it("keeps the local copy when the fetch fails", async () => {
    const local = linked();
    const deck = await refreshLinkedDeck(local, 100, async () => {
      throw new Error("offline");
    });
    expect(deck).toBe(local);
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

  it("a deep link to a planner deck that is already linked updates that deck in place (#1017)", async () => {
    saveDeck({ id: "from-duel", name: "Mine", leaderId: "ST01-001", cards: ["ST01-003"], plannerDeckId: 7 });
    const r = await applyPlannerDeepLink(link, true, async () => detail());
    expect(r.ok && r.deck.id).toBe("from-duel");
    expect(getSavedDeck("from-duel")?.name).toBe("Red Luffy");
    expect(listSavedDecks().filter((d) => d.plannerDeckId === 7)).toHaveLength(1);
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

describe("Duel alt arts shown in the planner (#1017)", () => {
  // OP09-118: p2 = product 597066. OP09-093 has alts too but this deck leaves it on base art.
  const mk = () =>
    saveDeck({
      id: "linked",
      name: "Art deck",
      leaderId: "ST01-001",
      cards: ["OP09-118", "OP09-118", "OP09-093", "ST01-003"],
      artPrefs: { "OP09-118": "p2" },
      plannerDeckId: 42,
    });

  it("sends the alt art of a card whose pick differs from what the planner was last set to, and records it (#1017)", async () => {
    mk();
    const puts: [string, number][] = [];
    const saved = await pushDeckArtToPlanner("linked", async (id, product) => void puts.push([id, product]));
    expect(puts).toEqual([["OP09-118", 597066]]);
    expect(saved?.plannerArt).toEqual({ "OP09-118": "p2" });
    puts.length = 0;
    await pushDeckArtToPlanner("linked", async (id, product) => void puts.push([id, product]));
    expect(puts).toEqual([]);
    setDeckArtPref("linked", "OP09-118", "p1");
    await pushDeckArtToPlanner("linked", async (id, product) => void puts.push([id, product]));
    expect(puts).toEqual([["OP09-118", 597065]]);
  });

  it("a failing request is not recorded, is retried later, and never throws (#1017)", async () => {
    mk();
    saveDeck({ id: "linked", name: "Art deck", leaderId: "ST01-001", cards: getSavedDeck("linked")!.cards, artPrefs: { "OP09-118": "p2", "OP09-093": "p1" } });
    const saved = await pushDeckArtToPlanner("linked", async (id) => {
      if (id === "OP09-118") throw new Error("boom");
    });
    expect(saved?.plannerArt).toEqual({ "OP09-093": "p1" });
    const retried: string[] = [];
    await pushDeckArtToPlanner("linked", async (id) => void retried.push(id));
    expect(retried).toEqual(["OP09-118"]);
    expect(getSavedDeck("linked")?.plannerArt).toEqual({ "OP09-093": "p1", "OP09-118": "p2" });
  });

  it("goes through every linked deck and skips the others (#1017)", async () => {
    mk();
    saveDeck({ id: "plain", name: "Plain", leaderId: "ST01-001", cards: ["OP09-118"], artPrefs: { "OP09-118": "p1" } });
    const sent: string[] = [];
    await pushLinkedDeckArt(async (id, product) => void sent.push(`${id}:${product}`));
    expect(sent).toEqual(["OP09-118:597066"]);
    expect(getSavedDeck("linked")?.plannerArt).toEqual({ "OP09-118": "p2" });
    expect(getSavedDeck("plain")?.plannerArt).toBeUndefined();
  });

  it("sends nothing for a deck that is not linked to a planner deck (#1017)", async () => {
    saveDeck({ id: "plain", name: "Plain", leaderId: "ST01-001", cards: ["OP09-118"], artPrefs: { "OP09-118": "p2" } });
    let called = false;
    await pushDeckArtToPlanner("plain", async () => void (called = true));
    expect(called).toBe(false);
  });
});
