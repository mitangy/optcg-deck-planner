import { describe, expect, it } from "vitest";
import type { CardPagePrinting } from "../api";
import { cardFacts, leaderPlayLine, parseArt, parseDays, printingLabel, selectPrinting, usageHeadline } from "./cardPageModel";

const p = (product_id: number, name: string): CardPagePrinting => ({
  product_id,
  name,
  market_price: 1,
  image_url: "",
  tcgplayer_url: "",
  group_name: "",
  is_special: product_id !== 10,
});
const PRINTINGS = [p(10, "Nami"), p(20, "Nami (Alternate Art)"), p(30, "Nami (016) (Manga)")];

describe("card page URL and printing choice (#953)", () => {
  it("?art is a positive product id; anything else is the base art (#953)", () => {
    expect([parseArt("20"), parseArt(null), parseArt(""), parseArt("0"), parseArt("-5"), parseArt("2.5"), parseArt("abc")]).toEqual([20, 0, 0, 0, 0, 0, 0]);
  });

  it("?days keeps the windows the meta pages offer and falls back to the default (#953)", () => {
    expect([parseDays("7"), parseDays("14"), parseDays("30"), parseDays("90"), parseDays(null)]).toEqual([7, 14, 30, 30, 30]);
  });

  it("an art picks its printing and is charted by its own product id (#953)", () => {
    expect(selectPrinting(PRINTINGS, 30)).toMatchObject({ productId: 30, printing: { name: "Nami (016) (Manga)" } });
  });

  it("no art, an unknown art, or the base printing's own id all show the base art, charted as product 0 (#953)", () => {
    for (const art of [0, 999, 10]) expect(selectPrinting(PRINTINGS, art)).toMatchObject({ productId: 0, printing: { product_id: 10 } });
  });

  it("a card with no printings has nothing selected (#953)", () => {
    expect(selectPrinting([], 20)).toEqual({ printing: null, productId: 0 });
  });
});

describe("card page wording (#953)", () => {
  it("tiles are labelled Base for the first printing and by art marks for the rest, without the collector number (#953)", () => {
    expect(PRINTINGS.map(printingLabel)).toEqual(["Base", "Alternate Art", "Manga"]);
    expect(printingLabel(p(40, "Nami"), 3)).toBe("Alt art 3");
  });

  it("facts list the type, colors with a slash and the cost, skipping what is missing (#953)", () => {
    expect(cardFacts({ rarity: "SR", color: "Red;Green", card_type: "Character", cost: "4" })).toEqual(["Character", "Red/Green", "Cost 4"]);
    expect(cardFacts({ rarity: "L", color: "", card_type: "Leader", cost: null })).toEqual(["Leader"]);
  });

  it("a leader's play line reads decks of its own and a percent (#953)", () => {
    expect(leaderPlayLine({ decks_with_card: 2, leader_decks: 3, rate: 0.667 })).toBe("2 of 3 decks · 66.7%");
    expect(leaderPlayLine({ decks_with_card: 1, leader_decks: 1, rate: 1 })).toBe("1 of 1 deck · 100.0%");
  });

  it("the headline tells no data, not played, and played apart; a leader reads as decks it led (#953)", () => {
    const base = { is_leader: false, decks_with_card: 0, total_decks: 0, rate: 0, days: 30 };
    expect(usageHeadline(base)).toBe("No tournament decklists in the last 30 days.");
    expect(usageHeadline({ ...base, total_decks: 1200 })).toBe("Not played in the last 30 days (1,200 decks).");
    expect(usageHeadline({ ...base, total_decks: 1200, decks_with_card: 300, rate: 0.25 })).toBe("25.0% of decklists (300 of 1,200)");
    expect(usageHeadline({ ...base, is_leader: true, total_decks: 1200, decks_with_card: 120, rate: 0.1 })).toBe("10.0% of decks led by it (120 of 1,200)");
  });
});
