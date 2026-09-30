import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyPlannerDeepLink,
  parsePlannerDeepLink,
  plannerDeckToDecklist,
  refreshLinkedDeck,
  savedDeckToPlannerList,
  type PlannerDeckDetail,
} from "./planner";
import { getSavedDeck, saveDeck, upsertPlannerDeck } from "./storage";

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

describe("refreshLinkedDeck", () => {
  const linked = () =>
    saveDeck({ id: "planner-7", name: "Old", leaderId: "ST01-001", cards: [], plannerDeckId: 7 });

  it("replaces the local copy with the fresh planner deck", async () => {
    const deck = await refreshLinkedDeck(linked(), 100, async () => detail());
    expect(deck.cards).toHaveLength(6);
    expect(getSavedDeck("planner-7")?.name).toBe("Red Luffy");
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
