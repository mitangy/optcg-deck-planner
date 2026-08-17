import { describe, expect, it } from "vitest";
import { cardImageUrl } from "./cardImage";

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
  });
});
