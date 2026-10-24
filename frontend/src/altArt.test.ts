import { describe, expect, it } from "vitest";
import type { PrintingView } from "./api";
import { baseTileFor, featuredAlt, mainImageUrl, shownProductId } from "./altArt";

const alt = (product_id: number, owned: number, image_url = `alt${product_id}.jpg`): PrintingView => ({
  product_id,
  name: `Alt ${product_id}`,
  market_price: null,
  low_price: null,
  image_url,
  tcgplayer_url: "",
  group_name: "",
  is_special: true,
  owned,
});

describe("featuredAlt", () => {
  it("picks the alt with the most owned copies (#625)", () => {
    expect(featuredAlt({ alt_arts: [alt(1, 1), alt(2, 3), alt(3, 2)] })?.product_id).toBe(2);
  });

  it("breaks ties toward the first alt in the list (#625)", () => {
    expect(featuredAlt({ alt_arts: [alt(1, 2), alt(2, 2)] })?.product_id).toBe(1);
  });

  it("is null when no alt is owned (#625)", () => {
    expect(featuredAlt({ alt_arts: [alt(1, 0), alt(2, 0)] })).toBeNull();
    expect(featuredAlt({})).toBeNull();
  });
});

describe("mainImageUrl", () => {
  it("shows the owned alt art, else the base art (#625)", () => {
    expect(mainImageUrl({ image_url: "base.jpg", alt_arts: [alt(1, 1)] })).toBe("alt1.jpg");
    expect(mainImageUrl({ image_url: "base.jpg", alt_arts: [alt(1, 0)] })).toBe("base.jpg");
  });

  it("falls back to base when the owned alt has no image (#625)", () => {
    expect(mainImageUrl({ image_url: "base.jpg", alt_arts: [alt(1, 1, "")] })).toBe("base.jpg");
  });
});

describe("display_art choice (#702)", () => {
  it("0 shows the base art even while an alt is owned (#702)", () => {
    const card = { image_url: "base.jpg", alt_arts: [alt(1, 3)], display_art: 0 };
    expect(featuredAlt(card)).toBeNull();
    expect(mainImageUrl(card)).toBe("base.jpg");
    expect(shownProductId(card)).toBe(0);
  });

  it("a chosen alt is shown even when unowned and others are owned (#702)", () => {
    const card = { image_url: "base.jpg", alt_arts: [alt(1, 3), alt(2, 0)], display_art: 2 };
    expect(featuredAlt(card)?.product_id).toBe(2);
    expect(mainImageUrl(card)).toBe("alt2.jpg");
    expect(shownProductId(card)).toBe(2);
  });

  it("an unknown or null choice falls back to the most-owned alt (#702)", () => {
    const alts = [alt(1, 1), alt(2, 3)];
    expect(featuredAlt({ alt_arts: alts, display_art: 99 })?.product_id).toBe(2);
    expect(featuredAlt({ alt_arts: alts, display_art: null })?.product_id).toBe(2);
    expect(featuredAlt({ alt_arts: alts })?.product_id).toBe(2);
  });

  it("the Base tile appears when an unowned alt is the chosen art (#702)", () => {
    const card = {
      name: "Nami",
      market_price: 1,
      alt_arts: [alt(1, 0)],
      display_art: 1,
    };
    expect(baseTileFor(card)).not.toBeNull();
    expect(baseTileFor({ ...card, display_art: 0 })).toBeNull();
  });
});
