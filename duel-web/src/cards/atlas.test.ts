import { describe, expect, it } from "vitest";
import { lookupCard } from "./atlas";
import { isTcgplayerCdnUrl } from "./cardImage";

describe("atlas art resolution", () => {
  it("resolves Rocks OP17-039 to TCGPlayer CDN (not missing /cards mirror)", () => {
    const rocks = lookupCard("OP17-039");
    expect(rocks.imageUrl).toBe(
      "https://tcgplayer-cdn.tcgplayer.com/product/712086_400w.jpg",
    );
    expect(isTcgplayerCdnUrl(rocks.imageUrl)).toBe(true);
    expect(rocks.altArts?.length).toBeGreaterThan(0);
    expect(rocks.altArts?.find((a) => a.id === "p1")?.imageUrl).toBe(
      "https://tcgplayer-cdn.tcgplayer.com/product/710591_400w.jpg",
    );
  });

  it("resolves ST01-005 to TCGPlayer CDN", () => {
    const usopp = lookupCard("ST01-005");
    expect(usopp.imageUrl).toBe(
      "https://tcgplayer-cdn.tcgplayer.com/product/288234_400w.jpg",
    );
  });

  it("keeps curated CDN alts for mapped leaders (e.g. Teach)", () => {
    const teach = lookupCard("OP16-080");
    expect(teach.altArts?.some((a) => a.id === "p1")).toBe(true);
    expect(isTcgplayerCdnUrl(teach.altArts?.[0]?.imageUrl)).toBe(true);
  });
});
