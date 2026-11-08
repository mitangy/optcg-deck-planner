import { describe, expect, it } from "vitest";
import { TCG_PRODUCTS, tcgAltsForCard, tcgArtForCard, tcgProductImageUrl } from "./tcgArt.js";

describe("TCGPlayer art helpers", () => {
  it("builds thumb (_400w) and large (_in_1000x1000) CDN urls", () => {
    expect(tcgProductImageUrl(123)).toBe("https://tcgplayer-cdn.tcgplayer.com/product/123_400w.jpg");
    expect(tcgProductImageUrl(123, "large")).toBe("https://tcgplayer-cdn.tcgplayer.com/product/123_in_1000x1000.jpg");
  });

  it("maps a card to its product art and gives no art for an unmapped card", () => {
    const [id, hit] = Object.entries(TCG_PRODUCTS)[0]!;
    expect(tcgArtForCard(id)).toBe(tcgProductImageUrl(hit.productId));
    expect(tcgArtForCard("ZZ99-999")).toBeUndefined();
  });

  it("lists a card's alternate arts with their own product ids and urls", () => {
    const [id, hit] = Object.entries(TCG_PRODUCTS).find(([, h]) => h.alts.length > 0)!;
    const alt = hit.alts[0]!;
    expect(tcgAltsForCard(id)[0]).toEqual({ id: alt.id, label: alt.label, imageUrl: tcgProductImageUrl(alt.productId), productId: alt.productId });
    expect(tcgAltsForCard("ZZ99-999")).toEqual([]);
  });
});
