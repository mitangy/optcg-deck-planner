import { describe, expect, it } from "vitest";
import type { PrintingView } from "./api";
import { featuredAlt, mainImageUrl } from "./altArt";

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
