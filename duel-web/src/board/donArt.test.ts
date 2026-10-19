import { describe, expect, it } from "vitest";
import { DON_CARD_ART, donArtUrl } from "./donArt";

describe("donArtUrl", () => {
  it("points a chosen product at the TCGPlayer CDN image (#440)", () => {
    expect(donArtUrl(512345)).toBe("https://tcgplayer-cdn.tcgplayer.com/product/512345_400w.jpg");
  });

  it("uses the bundled art when nothing valid is chosen (#440)", () => {
    for (const bad of [null, undefined, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 2]) {
      expect(donArtUrl(bad), String(bad)).toBe(DON_CARD_ART);
    }
    expect(donArtUrl("512345" as unknown as number)).toBe(DON_CARD_ART);
  });
});
