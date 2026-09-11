import { describe, expect, it } from "vitest";
import { cardImageUrl, isTcgplayerCdnUrl } from "./cardImage";
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
