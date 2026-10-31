import { describe, expect, it } from "vitest";
import { artAfterError, cardImageUrl, isPlaceholderArt } from "./cardImage";
import previewIds from "./previewArt.json";
import altIds from "./previewArtAlts.json";

// Read ids from the manifests: the daily art sync retires previews once official art is up.
const CARD = previewIds[0]!;
const ALT = altIds[0]!;

const catalog = "https://tcgplayer-cdn.tcgplayer.com/product/453505_200w.jpg";

describe("cardImageUrl", () => {
  it("rewrites TCGCSV _200w thumbs to 400w and the 1000-box large variant", () => {
    expect(cardImageUrl(catalog, "thumb")).toBe(
      "https://tcgplayer-cdn.tcgplayer.com/product/453505_400w.jpg",
    );
    expect(cardImageUrl(catalog, "large")).toBe(
      "https://tcgplayer-cdn.tcgplayer.com/product/453505_in_1000x1000.jpg",
    );
  });

  it("converts already-sized CDN URLs between thumb and large", () => {
    const large = "https://tcgplayer-cdn.tcgplayer.com/product/453505_in_1000x1000.jpg";
    expect(cardImageUrl(large, "thumb")).toBe(
      "https://tcgplayer-cdn.tcgplayer.com/product/453505_400w.jpg",
    );
    expect(cardImageUrl("https://tcgplayer-cdn.tcgplayer.com/product/9_400w.jpg", "large")).toBe(
      "https://tcgplayer-cdn.tcgplayer.com/product/9_in_1000x1000.jpg",
    );
  });

  it("leaves non-TCGplayer URLs and empty values alone", () => {
    expect(cardImageUrl("", "large")).toBe("");
    expect(cardImageUrl(undefined, "thumb")).toBe("");
    expect(cardImageUrl("https://example.test/OP01-002.png", "large")).toBe(
      "https://example.test/OP01-002.png",
    );
    expect(cardImageUrl("/cards/ST01-001.png", "large")).toBe("/cards/ST01-001.png");
  });
});

describe("artAfterError", () => {
  it("tries the local mirror once after the CDN fails, then gives up for the text fallback (#262)", () => {
    const cdn = "https://tcgplayer-cdn.tcgplayer.com/product/123456_200w.jpg";
    const local = artAfterError(cdn, "op01-001");
    expect(local).toBe("/cards/OP01-001.png");
    expect(artAfterError(local!, "op01-001")).toBeNull();
  });

  it("cards with preview art fall back to it when TCGPlayer art fails (#575)", () => {
    const cdn = "https://tcgplayer-cdn.tcgplayer.com/product/123456_400w.jpg";
    const preview = artAfterError(cdn, CARD);
    expect(preview).toBe(`/cards/preview/${CARD}.webp`);
    expect(artAfterError(preview!, CARD)).toBeNull();
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

  it("a failed alt printing shows its own preview, not the card's (#581)", () => {
    // Both the card and the alt printing have previews, so the alt's own must win.
    const alt = `https://tcgplayer-cdn.tcgplayer.com/product/${ALT}_400w.jpg`;
    const preview = artAfterError(alt, CARD);
    expect(preview).toBe(`/cards/preview/p${ALT}.webp`);
    expect(artAfterError(preview!, CARD)).toBeNull();
    // Large (_in_1000x1000) urls resolve the same product.
    expect(artAfterError(`https://tcgplayer-cdn.tcgplayer.com/product/${ALT}_in_1000x1000.jpg`, CARD)).toBe(
      `/cards/preview/p${ALT}.webp`,
    );
    // A product without an alt preview keeps the card-level chain.
    const other = "https://tcgplayer-cdn.tcgplayer.com/product/999999_400w.jpg";
    expect(artAfterError(other, CARD)).toBe(`/cards/preview/${CARD}.webp`);
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
