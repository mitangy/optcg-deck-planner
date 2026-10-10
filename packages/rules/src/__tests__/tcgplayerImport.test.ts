import { describe, expect, it } from "vitest";
import type { CardDataRow } from "../cards/cardData.js";
import { cardSourceRecord } from "../cards/sourceRecords.js";
import { buildCards, normalizeCardName, type CandidateCard } from "../tools/buildCardData.js";
import { convertDescription, mergeProducts, productCardId, type TcgProduct } from "../tools/importTcgplayerCards.js";

function product(productId: number, name: string, data: Record<string, string>): TcgProduct {
  return { productId, name, extendedData: Object.entries(data).map(([k, value]) => ({ name: k, value })) };
}

const base = { Rarity: "R", Color: "Green;Yellow", CardType: "Character", Cost: "3", Power: "4000", Counterplus: "1000", Subtypes: "Straw Hat Crew;East Blue", Attribute: "Wisdom", Description: "[On Play] Draw 1 card." };

function row(over: Partial<CardDataRow> = {}): CardDataRow {
  return { name: "Old", type: "character", colors: ["red"], cost: 1, traits: [], attributes: [], text: "old", trigger: "", source: "bundled", sourceUrl: "", ...over };
}

describe("TCGPlayer description conversion (#458)", () => {
  it("strips tags and line breaks and splits the [Trigger] line off (#458)", () => {
    const html = "[On Play] <strong>You may trash 1 card from your hand:</strong> Draw 1 card.\r\n<br>[Activate: Main] Do it.\r\n<br>[Trigger] Play this card.";
    expect(convertDescription(html)).toEqual({
      text: "[On Play] You may trash 1 card from your hand: Draw 1 card. [Activate: Main] Do it.",
      trigger: "[Trigger] Play this card.",
    });
  });

  it("does not split at a [Trigger] inside a sentence (#458)", () => {
    const html = "[On Play] Up to 3 of your Characters with both the {Revolutionary Army} type and a [Trigger] gain +2000 power during this turn.\r\n<br>[Activate: Main] Do it.";
    const out = convertDescription(html);
    expect(out.trigger).toBe("");
    expect(out.text).toContain("and a [Trigger] gain +2000 power");
  });

  it("writes power changes and DON!! costs with the minus sign Bandai rows use (#458)", () => {
    const out = convertDescription("[On Play] <strong>DON!! -2:</strong> Give up to 1 of your opponent's Characters-4000 power during this turn.\r\n<br>[Main] Give your Leader -1000 power.");
    expect(out.text).toBe("[On Play] DON!! −2: Give up to 1 of your opponent's Characters −4000 power during this turn. [Main] Give your Leader −1000 power.");
  });

  it("keeps reminder text and bare hyphens elsewhere (#458)", () => {
    const out = convertDescription("[Blocker]\r\n<br><em>(After your opponent declares an attack, you may rest this card.)</em> Fish-Man Island -1 card.");
    expect(out.text).toBe("[Blocker] (After your opponent declares an attack, you may rest this card.) Fish-Man Island -1 card.");
  });

  it("a card that only has a [Trigger] has no main text (#458)", () => {
    expect(convertDescription("[Trigger] Draw 1 card.")).toEqual({ text: "", trigger: "[Trigger] Draw 1 card." });
  });
});

describe("TCGPlayer import merge (#458)", () => {
  const products = [
    product(100, "Sealed Box", {}),
    product(300, "Nami (055) (Alternate Art)", { ...base, Number: "EB05-055" }),
    product(200, "Nami (055)", { ...base, Number: "EB05-055", Description: "[Your Turn] [On Play] Draw 1 card.\r\n<br>[Trigger] Play this card." }),
    product(150, "Nami (055) (SP)", { ...base, Number: "EB05-055", Description: "[SP art] Different wording." }),
    product(400, "Leader (001)", { ...base, Number: "EB05-001", CardType: "Leader", Life: "4", Cost: "", Counterplus: "" }),
    product(500, "Already Official", { ...base, Number: "EB05-002", Description: "TCGPlayer wording" }),
    product(600, "Bundled", { ...base, Number: "EB05-003" }),
    product(700, "Other Set Reprint", { ...base, Number: "OP01-016" }),
    product(710, "Missing Other Set Card", { ...base, Number: "OP18-055" }),
    product(800, "Padding", { ...base, Number: "EB05-004" }),
    product(801, "Padding 2", { ...base, Number: "EB05-005" }),
  ];
  const existing: Record<string, CardDataRow> = {
    "EB05-002": row({ source: "bandai", text: "official wording", name: "Official" }),
    "EB05-003": row({ source: "bundled" }),
    "OP01-016": row({ source: "bundled", text: "keep me" }),
  };

  it("sealed products have no card id (#458)", () => {
    expect(productCardId(products[0]!)).toBeNull();
    expect(productCardId(products[2]!)).toBe("EB05-055");
  });

  it("never overwrites a Bandai row (#458)", () => {
    const out = mergeProducts(existing, products);
    expect(out.cards["EB05-002"]).toEqual(existing["EB05-002"]);
    expect(out.skippedBandai).toEqual(["EB05-002"]);
  });

  it("adds missing ids and upgrades bundled rows to tcgplayer rows (#458)", () => {
    const out = mergeProducts(existing, products);
    expect(out.added).toEqual(expect.arrayContaining(["EB05-001", "EB05-055", "EB05-004"]));
    expect(out.upgraded).toEqual(["EB05-003"]);
    expect(out.cards["EB05-003"]).toMatchObject({ source: "tcgplayer", traits: ["Straw Hat Crew", "East Blue"], attributes: ["Wisdom"], counter: 1000, colors: ["green", "yellow"] });
  });

  it("takes the card from the base printing at its product id, not an SP or alternate art one (#458)", () => {
    const nami = mergeProducts(existing, products).cards["EB05-055"]!;
    expect(nami).toMatchObject({ name: "Nami", sourceUrl: "https://www.tcgplayer.com/product/200", text: "[Your Turn] [On Play] Draw 1 card.", trigger: "[Trigger] Play this card." });
  });

  it("leaders have no cost and carry Life (#458)", () => {
    const leader = mergeProducts(existing, products).cards["EB05-001"]!;
    expect(leader).toMatchObject({ type: "leader", life: 4 });
    expect(leader).not.toHaveProperty("cost");
    expect(leader).not.toHaveProperty("counter");
  });

  it("ignores another set's reprint but adds an id cardData does not have at all (#458)", () => {
    const out = mergeProducts(existing, products);
    expect(out.cards["OP01-016"]).toEqual(existing["OP01-016"]);
    expect(out.ignoredForeign).toEqual(["OP01-016"]);
    expect(out.cards["OP18-055"]).toMatchObject({ source: "tcgplayer" });
  });
});

describe("card names from TCGPlayer printings (#458)", () => {
  it("strips Alternate Art and Manga printing suffixes but keeps real parentheses (#458)", () => {
    expect(normalizeCardName("Nico Robin (010) (Alternate Art)")).toBe("Nico Robin");
    expect(normalizeCardName("Shirahoshi (Manga)")).toBe("Shirahoshi");
    expect(normalizeCardName("Zephyr (Navy)")).toBe("Zephyr (Navy)");
  });
});

describe("TCGPlayer printing markers beyond SP/Alternate Art/Manga (#459)", () => {
  const nami = (id: number, name: string) => product(id, name, { ...base, Number: "OP17-001" });

  it("TCGPlayer import keeps the base name when a Parallel printing sorts first (#459)", () => {
    const out = mergeProducts({}, [nami(100, "Nami (Parallel)"), nami(101, "Nami")]);
    expect(out.cards["OP17-001"]).toMatchObject({ name: "Nami", sourceUrl: "https://www.tcgplayer.com/product/101" });
  });

  it("TCGPlayer import strips the printing suffix when only a variant is listed (#459)", () => {
    const out = mergeProducts({}, [nami(100, "Nami (Treasure Rare)")]);
    expect(out.cards["OP17-001"]!.name).toBe("Nami");
  });

  it("normalizeCardName strips every known printing marker but keeps real parentheses (#459)", () => {
    for (const marker of ["Parallel", "Treasure Rare", "Full Art", "Box Topper", "Jolly Roger Foil"]) {
      expect(normalizeCardName(`Nami (${marker})`)).toBe("Nami");
    }
    expect(normalizeCardName("Gloriosa (Grandma Nyon)")).toBe("Gloriosa (Grandma Nyon)");
  });
});

describe("Bandai rebuild keeps TCGPlayer rows (#458)", () => {
  const bandai = (id: string): CandidateCard => ({ id, name: "Official", type: "character", colors: ["red"], cost: 2, effectText: "official", sources: [{ url: "u", sha256: "x" }] });
  const tcg = row({ source: "tcgplayer", name: "From TCG", sourceUrl: "https://www.tcgplayer.com/product/1" });
  const meta = { cost: 1, type: "character", name: "Bundled" };

  it("keeps a tcgplayer row the candidate lacks, ahead of the bundled one (#458)", () => {
    const cards = buildCards({}, { "EB05-001": meta }, { "EB05-001": tcg });
    expect(cards["EB05-001"]).toMatchObject({ source: "tcgplayer", name: "From TCG" });
  });

  it("the Bandai row wins once the candidate has the id (#458)", () => {
    const cards = buildCards({ "EB05-001": bandai("EB05-001") }, { "EB05-001": meta }, { "EB05-001": tcg });
    expect(cards["EB05-001"]).toMatchObject({ source: "bandai", name: "Official", text: "official" });
  });

  it("does not carry over a previous bundled row, which is rebuilt from the bundled catalog (#458)", () => {
    const cards = buildCards({}, { "EB05-001": meta }, { "EB05-001": row({ source: "bundled", name: "Stale" }) });
    expect(cards["EB05-001"]).toMatchObject({ source: "bundled", name: "Bundled" });
  });
});

describe("provenance of TCGPlayer rows (#458)", () => {
  it("traits from TCGPlayer are unverified while bundled rows' stay unknown (#458)", () => {
    expect(cardSourceRecord("EB05-002")?.fields).toMatchObject({ traits: "unverified", identity: "unverified" });
    expect(cardSourceRecord("EB05-002")?.sourceUrl).toMatch(/^https:\/\/www\.tcgplayer\.com\/product\/\d+$/);
    expect(cardSourceRecord("EB05-002")?.sourceRevision).toBeNull();
    expect(cardSourceRecord("OP18-021")?.fields.traits).toBe("unknown");
  });
});
