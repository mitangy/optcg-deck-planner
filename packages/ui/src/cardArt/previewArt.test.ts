import { describe, expect, it } from "vitest";
import { cardArtChain } from "./cardImage";
import { previewArtUrl } from "./previewArt";

const ORIGIN = "https://duel.example.test";
const PREVIEW = `${ORIGIN}/cards/preview`;
// 712884 is in previewArtAlts.json; EB05-061 is in previewArt.json.
const altUrl = "https://tcgplayer-cdn.tcgplayer.com/product/712884_200w.jpg";
const plainUrl = "https://tcgplayer-cdn.tcgplayer.com/product/1_200w.jpg";

describe("previewArtUrl", () => {
  it("uses the card-id preview for a new card (#613)", () => {
    expect(previewArtUrl("EB05-061", plainUrl, ORIGIN)).toBe(`${PREVIEW}/EB05-061.webp`);
    expect(previewArtUrl(" eb05-061 ", undefined, ORIGIN)).toBe(`${PREVIEW}/EB05-061.webp`);
  });

  it("prefers the alt-printing preview over the card-id preview (#613)", () => {
    expect(previewArtUrl("EB05-061", altUrl, ORIGIN)).toBe(`${PREVIEW}/p712884.webp`);
  });

  it("uses the alt preview even when the card id has none (#613)", () => {
    expect(previewArtUrl("OP01-001", altUrl, ORIGIN)).toBe(`${PREVIEW}/p712884.webp`);
  });

  it("builds relative paths when no origin is given (#700)", () => {
    expect(previewArtUrl("EB05-061")).toBe("/cards/preview/EB05-061.webp");
    expect(previewArtUrl("OP01-001", altUrl)).toBe("/cards/preview/p712884.webp");
  });

  it("has no preview for a card with real art (#613)", () => {
    expect(previewArtUrl("OP01-001", plainUrl)).toBeNull();
    expect(previewArtUrl(undefined, undefined)).toBeNull();
  });
});

describe("cardArtChain", () => {
  it("tries the resized art, the original, then the preview (#613)", () => {
    expect(cardArtChain(plainUrl, "EB05-061", "thumb", ORIGIN)).toEqual([
      "https://tcgplayer-cdn.tcgplayer.com/product/1_400w.jpg",
      plainUrl,
      `${PREVIEW}/EB05-061.webp`,
    ]);
  });

  it("shows the preview when the card has no image URL (#613)", () => {
    expect(cardArtChain(undefined, "EB05-061", "large", ORIGIN)).toEqual([`${PREVIEW}/EB05-061.webp`]);
  });

  it("ends at the original when there is no preview (#613)", () => {
    expect(cardArtChain(plainUrl, "OP01-001", "large")).toEqual([
      "https://tcgplayer-cdn.tcgplayer.com/product/1_in_1000x1000.jpg",
      plainUrl,
    ]);
    expect(cardArtChain(undefined, "OP01-001", "thumb")).toEqual([]);
  });

  it("does not repeat a URL that is not resized (#613)", () => {
    expect(cardArtChain("https://example.test/a.png", "OP01-001", "thumb")).toEqual([
      "https://example.test/a.png",
    ]);
  });
});
