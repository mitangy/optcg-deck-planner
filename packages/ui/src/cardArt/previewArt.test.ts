import { describe, expect, it } from "vitest";
import { cardArtChain } from "./cardImage";
import { previewArtUrl } from "./previewArt";
import previewIds from "./previewArt.json";
import altIds from "./previewArtAlts.json";

const ORIGIN = "https://duel.example.test";
const PREVIEW = `${ORIGIN}/cards/preview`;
// Read ids from the manifests: the daily art sync retires previews once official art is up.
const CARD = previewIds[0]!;
const ALT = altIds[0]!;
const altUrl = `https://tcgplayer-cdn.tcgplayer.com/product/${ALT}_200w.jpg`;
const plainUrl = "https://tcgplayer-cdn.tcgplayer.com/product/1_200w.jpg";

describe("previewArtUrl", () => {
  it("uses the card-id preview for a new card (#613)", () => {
    expect(previewArtUrl(CARD, plainUrl, ORIGIN)).toBe(`${PREVIEW}/${CARD}.webp`);
    expect(previewArtUrl(` ${CARD.toLowerCase()} `, undefined, ORIGIN)).toBe(`${PREVIEW}/${CARD}.webp`);
  });

  it("prefers the alt-printing preview over the card-id preview (#613)", () => {
    expect(previewArtUrl(CARD, altUrl, ORIGIN)).toBe(`${PREVIEW}/p${ALT}.webp`);
  });

  it("uses the alt preview even when the card id has none (#613)", () => {
    expect(previewArtUrl("OP01-001", altUrl, ORIGIN)).toBe(`${PREVIEW}/p${ALT}.webp`);
  });

  it("builds relative paths when no origin is given (#700)", () => {
    expect(previewArtUrl(CARD)).toBe(`/cards/preview/${CARD}.webp`);
    expect(previewArtUrl("OP01-001", altUrl)).toBe(`/cards/preview/p${ALT}.webp`);
  });

  it("has no preview for a card with real art (#613)", () => {
    expect(previewArtUrl("OP01-001", plainUrl)).toBeNull();
    expect(previewArtUrl(undefined, undefined)).toBeNull();
  });
});

describe("cardArtChain", () => {
  it("tries the resized art, the original, then the preview (#613)", () => {
    expect(cardArtChain(plainUrl, CARD, "thumb", ORIGIN)).toEqual([
      "https://tcgplayer-cdn.tcgplayer.com/product/1_400w.jpg",
      plainUrl,
      `${PREVIEW}/${CARD}.webp`,
    ]);
  });

  it("shows the preview when the card has no image URL (#613)", () => {
    expect(cardArtChain(undefined, CARD, "large", ORIGIN)).toEqual([`${PREVIEW}/${CARD}.webp`]);
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
