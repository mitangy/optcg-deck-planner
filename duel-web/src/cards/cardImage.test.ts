import { describe, expect, it } from "vitest";
import { artAfterError, cardImageUrl, isPlaceholderArt, isTcgplayerCdnUrl } from "./cardImage";
import { lookupCard } from "./atlas";

describe("cardImageUrl", () => {
  it("rewrites TCGplayer thumbs to _400w / _in_1000x1000", () => {
    const base = "https://tcgplayer-cdn.tcgplayer.com/product/694627_200w.jpg";
    expect(cardImageUrl(base, "thumb")).toBe(
      "https://tcgplayer-cdn.tcgplayer.com/product/694627_400w.jpg",
    );
    expect(cardImageUrl(base, "large")).toBe(
      "https://tcgplayer-cdn.tcgplayer.com/product/694627_in_1000x1000.jpg",
    );
  });

  it("leaves local /cards paths unchanged", () => {
    expect(cardImageUrl("/cards/ST01-001.png", "large")).toBe("/cards/ST01-001.png");
  });
});

describe("OP16-080 Teach art", () => {
  it("atlas imageUrl is a tcgplayer-cdn URL", () => {
    const teach = lookupCard("OP16-080");
    expect(teach.imageUrl).toBe(
      "https://tcgplayer-cdn.tcgplayer.com/product/694627_400w.jpg",
    );
    expect(isTcgplayerCdnUrl(teach.imageUrl)).toBe(true);
  });
});

describe("artAfterError", () => {
  it("tries the local mirror once after the CDN fails, then gives up for the text fallback (#262)", () => {
    const cdn = "https://tcgplayer-cdn.tcgplayer.com/product/123456_200w.jpg";
    const local = artAfterError(cdn, "op01-001");
    expect(local).toBe("/cards/OP01-001.png");
    expect(artAfterError(local!, "op01-001")).toBeNull();
  });
});

describe("EB05 preview art", () => {
  it("EB05 cards fall back to preview art when TCGPlayer art fails (#575)", () => {
    const cdn = "https://tcgplayer-cdn.tcgplayer.com/product/123456_400w.jpg";
    const preview = artAfterError(cdn, "EB05-001");
    expect(preview).toBe("/cards/preview/EB05-001.webp");
    expect(artAfterError(preview!, "EB05-001")).toBeNull();
    expect(artAfterError(cdn, "OP01-016")).toBe("/cards/OP01-016.png");
  });

  it("OP18 card whose local /cards art fails falls back to its preview, once (#575)", () => {
    const preview = artAfterError("/cards/OP18-021.png", "OP18-021");
    expect(preview).toBe("/cards/preview/OP18-021.webp");
    expect(artAfterError(preview!, "OP18-021")).toBeNull();
    // Cards with no preview end at the text fallback, and other URLs never retry.
    expect(artAfterError("/cards/OP01-016.png", "OP01-016")).toBeNull();
    expect(artAfterError("https://example.com/a.jpg", "OP18-021")).toBeNull();
  });
});

describe("alt art preview fallback (#581)", () => {
  it("a failed alt printing shows its own preview, not the card's (#581)", () => {
    // 722644 is EB05-010's alt; EB05-010 has no card-level preview, EB05-001 does.
    const alt = "https://tcgplayer-cdn.tcgplayer.com/product/722644_400w.jpg";
    const preview = artAfterError(alt, "EB05-010");
    expect(preview).toBe("/cards/preview/p722644.webp");
    expect(artAfterError(preview!, "EB05-010")).toBeNull();
    // Large (_in_1000x1000) urls resolve the same product.
    expect(artAfterError("https://tcgplayer-cdn.tcgplayer.com/product/722644_in_1000x1000.jpg", "EB05-010")).toBe(
      "/cards/preview/p722644.webp",
    );
    // A product without an alt preview keeps the card-level chain.
    const other = "https://tcgplayer-cdn.tcgplayer.com/product/999999_400w.jpg";
    expect(artAfterError(other, "EB05-001")).toBe("/cards/preview/EB05-001.webp");
    expect(artAfterError(other, "OP01-016")).toBe("/cards/OP01-016.png");
  });
});

describe("TCGplayer placeholder art (#276)", () => {
  const cdn = "https://tcgplayer-cdn.tcgplayer.com/product/694627_400w.jpg";

  it("a landscape picture from the CDN is the Image Coming Soon placeholder (#276)", () => {
    expect(isPlaceholderArt(cdn, 400, 285)).toBe(true);
    expect(isPlaceholderArt(cdn, 285, 400)).toBe(false);
  });

  it("only judges CDN pictures that have loaded (#276)", () => {
    expect(isPlaceholderArt("/cards/ST01-001.png", 400, 285)).toBe(false);
    expect(isPlaceholderArt(cdn, 0, 0)).toBe(false);
  });
});
