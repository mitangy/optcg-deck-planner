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
