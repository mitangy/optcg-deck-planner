import { describe, expect, it } from "vitest";
import { analyzeDeck, deckDrawOdds } from "./analysis";
import { keyMatches } from "./auth";
import { loadCatalog } from "./catalog";
import { exportDeck, fetchSharedDeck, parseDeckLine, parseDeckText } from "./decks";
import { searchCards } from "./search";

const catalog = loadCatalog();

/** OP01-001 Roronoa Zoro (red) with 50 red OP01 characters: 12 x4 + 1 x2. */
const legalDeckText = [
  "1xOP01-001",
  ...["004", "005", "006", "007", "008", "009", "010", "011", "012", "013", "014", "015"].map((n) => `4xOP01-${n}`),
  "2xOP01-016",
].join("\n");

describe("deck lists", () => {
  it("reads OPTCGSim lists with the count glued to the card number (#NNN)", () => {
    const deck = parseDeckText(catalog, "1xOP01-001\n4xOP01-016\n4xOP01-006");
    expect(deck.leaderId).toBe("OP01-001");
    expect(deck.cards).toEqual([
      { id: "OP01-006", copies: 4 },
      { id: "OP01-016", copies: 4 },
    ]);
  });

  it("reads Limitless lines and counts written after the card number (#NNN)", () => {
    expect(parseDeckLine("4 OP01-006")).toEqual({ id: "OP01-006", copies: 4 });
    expect(parseDeckLine("OP01-029 x3")).toEqual({ id: "OP01-029", copies: 3 });
    expect(parseDeckLine("Nami OP01-016")).toEqual({ id: "OP01-016", copies: 1 });
  });

  it("adds up repeated lines and alt-art numbers for one card (#NNN)", () => {
    const deck = parseDeckText(catalog, "1xOP01-001\n2xOP01-016\n2xOP01-016_p1");
    expect(deck.cards).toEqual([{ id: "OP01-016", copies: 4 }]);
  });

  it("keeps the first leader and warns about a second one (#NNN)", () => {
    const deck = parseDeckText(catalog, "1xOP01-001\n1xOP12-001\n4xOP01-016");
    expect(deck.leaderId).toBe("OP01-001");
    expect(deck.warnings.join(" ")).toMatch(/Extra leader OP12-001/);
  });

  it("exports OPTCGSim text with the leader first (#NNN)", () => {
    const deck = parseDeckText(catalog, "4 OP01-016\n1 OP01-001");
    expect(exportDeck(deck, "optcgsim")).toBe("1xOP01-001\n4xOP01-016");
  });

  it("leaves DON!! rows out of a shared planner deck instead of reporting unknown cards (#NNN)", async () => {
    const body = {
      kind: "deck",
      deck_name: "Zoro",
      items: [
        { card_id: "OP01-001", name: "Roronoa Zoro", card_type: "Leader", need: 1, primary_leader_card_id: "OP01-001" },
        { card_id: "OP01-016", name: "Nami", card_type: "Character", need: 4, primary_leader_card_id: "OP01-001" },
        { card_id: "PRB01-DON", name: "DON!! Card", card_type: "DON", need: 10, primary_leader_card_id: "OP01-001" },
      ],
    };
    const fakeFetch = (async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch;
    const deck = await fetchSharedDeck(catalog, "https://optcg-deck-planner.app/share/abc123def", fakeFetch);
    expect(deck).toMatchObject({ name: "Zoro", leaderId: "OP01-001", cards: [{ id: "OP01-016", copies: 4 }], unknown: [], warnings: [] });
  });
});

describe("card search", () => {
  it("legalFor drops cards that share no color with the leader (#NNN)", () => {
    const r = searchCards(catalog, { legalFor: "OP01-001", types: ["character"], limit: 100, set: "EB01" });
    const ids = r.cards.map((c) => c.id);
    expect(ids).toContain("EB01-002");
    expect(ids).not.toContain("EB01-022");
  });

  it("legalFor applies the leader's own deck rules (#NNN)", () => {
    // OP12-001 Silvers Rayleigh: no cards costing 5 or more.
    const r = searchCards(catalog, { legalFor: "OP12-001", set: "EB01", types: ["character"], limit: 100 });
    const ids = r.cards.map((c) => c.id);
    expect(ids).toContain("EB01-003");
    expect(ids).not.toContain("EB01-002");
  });

  it("needs every listed keyword (#NNN)", () => {
    const r = searchCards(catalog, { keywords: ["Banish", "Double Attack"], limit: 100 });
    expect(r.total).toBeGreaterThan(0);
    for (const c of r.cards) expect(c.keywords).toEqual(expect.arrayContaining(["Banish", "Double Attack"]));
  });

  it("treats counter 0 as no printed counter (#NNN)", () => {
    const ids = searchCards(catalog, { counters: [0], set: "OP01", types: ["character"], limit: 100 }).cards.map((c) => c.id);
    expect(ids).toContain("OP01-025");
    expect(ids).not.toContain("OP01-016");
  });

  it("finds effects nested inside conditions and sequences (#NNN)", () => {
    const card = catalog.cards.get("EB02-040")!;
    expect(card.effects).toContain("look");
    const nested = [...catalog.cards.values()].filter((c) =>
      (catalog.abilities.get(c.id) ?? []).some((a) => (a.effect as { do?: string } | undefined)?.do === "if" && JSON.stringify(a.effect).includes('"do":"ko"')),
    );
    expect(nested.length).toBeGreaterThan(0);
    for (const c of nested) {
      expect(c.effects).toContain("ko");
      expect(c.effects).not.toContain("if");
    }
  });
});

describe("deck analysis", () => {
  it("calls a 50-card deck with a leader legal, and not without the leader (#NNN)", () => {
    expect(analyzeDeck(catalog, parseDeckText(catalog, legalDeckText)).legal).toBe(true);
    const noLeader = parseDeckText(catalog, legalDeckText.replace("1xOP01-001\n", ""));
    expect(analyzeDeck(catalog, noLeader).legal).toBe(false);
  });

  it("counts hits for lower-case card numbers (#NNN)", () => {
    const odds = deckDrawOdds(catalog, parseDeckText(catalog, legalDeckText), { cardIds: ["op01-016"] }, {});
    expect(odds).toMatchObject({ deckSize: 50, hits: 2 });
  });
});

describe("connector key", () => {
  it("rejects a wrong or missing key once one is set (#NNN)", () => {
    expect(keyMatches("secret-key", "secret-key")).toBe(true);
    expect(keyMatches("secret-kez", "secret-key")).toBe(false);
    expect(keyMatches(undefined, "secret-key")).toBe(false);
  });
});
