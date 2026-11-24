import { describe, expect, it } from "vitest";
import { buildCardList, CARD_LIST_TOO_MANY_ERROR, cardListTool, type CardListInput } from "./cardList";
import { buildTools } from "./server";
import { catalog } from "./testkit";

// Brook (red, -2000 power on his attack), Raw Heat Strike (yellow Counter Event), Green Star Rafflesia (red Counter Event).
const BROOK = "OP01-022";
const YELLOW = "ST29-015";
const RAFFLESIA = "OP01-028";
const input = (cards: CardListInput["cards"]): CardListInput => ({ title: "Straw Hat power down", cards });
const built = (deck: Parameters<typeof buildCardList>[1], cards: CardListInput["cards"]) => {
  const r = buildCardList(catalog, deck, input(cards));
  if (!r.ok) throw new Error(r.error);
  return r.list;
};
const refused = (cards: CardListInput["cards"]) => {
  const r = buildCardList(catalog, undefined, input(cards));
  if (r.ok) throw new Error("expected a refusal");
  return r.error;
};

describe("show_cards (#1450)", () => {
  it("lists each card with its stats and the reason it was picked (#1450)", () => {
    const list = built(undefined, [{ id: BROOK, reason: " Gives -2000 power when attacking " }, { id: RAFFLESIA }]);
    expect(list).toMatchObject({ version: 1, kind: "card_list", title: "Straw Hat power down", leader_id: null });
    expect(list.cards[0]).toMatchObject({ id: BROOK, name: catalog.cards.get(BROOK)!.name, type: "character", colors: ["red"], cost: 4, power: 5000, reason: "Gives -2000 power when attacking" });
    expect(list.cards[1]).toMatchObject({ id: RAFFLESIA, type: "event", reason: "" });
  });

  it("leaves out cards the open deck's leader can't use: a color it can't play and a leader rule it breaks (#1450)", () => {
    const luffy = built({ leaderId: "OP01-001" }, [{ id: BROOK }, { id: YELLOW }]);
    expect(luffy.leader_id).toBe("OP01-001");
    expect(luffy.cards.map((c) => c.id)).toEqual([BROOK]);
    expect(luffy.dropped).toEqual([`${YELLOW} ${catalog.cards.get(YELLOW)!.name}`]);
    // Rayleigh's leader rule is "max cost 4": a 7-cost Zoro shares his color but breaks it.
    const rayleigh = built({ leaderId: "OP12-001" }, [{ id: BROOK }, { id: "OP14-015" }]);
    expect(rayleigh.cards.map((c) => c.id)).toEqual([BROOK]);
    expect(rayleigh.dropped).toHaveLength(1);
  });

  it("refuses a list the open deck's leader can use none of, naming the cards (#1450)", () => {
    const r = buildCardList(catalog, { leaderId: "OP01-001" }, input([{ id: YELLOW }]));
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining(YELLOW) });
  });

  it("keeps every card when no deck is open or its leader is not a leader card (#1450)", () => {
    for (const deck of [undefined, { leaderId: null }, { leaderId: BROOK }]) {
      const list = built(deck, [{ id: BROOK }, { id: YELLOW }]);
      expect(list.cards.map((c) => c.id), JSON.stringify(deck)).toEqual([BROOK, YELLOW]);
      expect(list.leader_id).toBeNull();
      expect(list.dropped).toEqual([]);
    }
  });

  it("marks a card a deck may hold any number of (#1450)", () => {
    const list = built(undefined, [{ id: "OP01-075" }, { id: BROOK }]);
    expect(list.cards[0]).toMatchObject({ id: "OP01-075", any_number: true });
    expect(list.cards[1]).not.toHaveProperty("any_number");
  });

  it("lists a card once however often the model repeats it, in the order given (#1450)", () => {
    const list = built(undefined, [{ id: RAFFLESIA }, { id: BROOK }, { id: RAFFLESIA.toLowerCase(), reason: "again" }]);
    expect(list.cards.map((c) => c.id)).toEqual([RAFFLESIA, BROOK]);
  });

  it("refuses a card number that is not in the catalog and DON!! cards (#1450)", () => {
    expect(refused([{ id: BROOK }, { id: "OP99-999" }])).toMatch(/OP99-999 is not a card number/);
    expect(refused([{ id: "DON-01" }])).toMatch(/DON!!/);
  });

  it("refuses after four lists in one answer (#1450)", async () => {
    const args = { title: "Cards", cards: [{ id: BROOK }] };
    const tool = cardListTool(catalog, undefined);
    for (let i = 0; i < 4; i++) expect((await tool.run(args)).isError).toBeUndefined();
    expect(await tool.run(args)).toMatchObject({ isError: true, content: [{ text: CARD_LIST_TOO_MANY_ERROR }] });
  });
});

describe("search_cards with a deck open (#1450)", () => {
  const search = async (openLeader: string | undefined, args: Record<string, unknown>) => {
    const tool = buildTools(catalog, undefined, undefined, {}, openLeader).find((t) => t.name === "search_cards")!;
    const v = (await tool.run({ traits: ["Straw Hat Crew"], effects: ["power_down"], limit: 100, ...args })).value as { cards: { id: string }[]; notes: string[] };
    return { ids: v.cards.map((c) => c.id), notes: v.notes };
  };

  it("only returns cards the open deck's leader can use, whatever colors the model asks for (#1450)", async () => {
    const open = await search("OP01-001", { colors: ["red", "yellow"] });
    expect(open.ids).toContain(BROOK);
    expect(open.ids).not.toContain(YELLOW);
    expect(open.notes.join(" ")).toMatch(/Only cards .* can use/);
    expect((await search(undefined, { colors: ["red", "yellow"] })).ids).toContain(YELLOW);
  });

  it("does not let the model widen it with another leader's legalFor (#1450)", async () => {
    // Zoro (cost 7) breaks Rayleigh's max-cost-4 rule but is fine for Luffy.
    const asLuffy = await search("OP12-001", { colors: ["red"], legalFor: "OP01-001" });
    expect(asLuffy.ids).toContain(BROOK);
    expect(asLuffy.ids).not.toContain("OP14-015");
  });
});
