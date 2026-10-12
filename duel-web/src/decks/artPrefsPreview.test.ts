import { describe, expect, it, vi } from "vitest";

vi.mock("../cards/atlas", () => ({
  lookupCard: (id: string) => ({
    id,
    name: id,
    type: "character",
    colors: [],
    cost: 0,
    imageUrl: id === "OP01-016" || id === "OP18-031" ? "https://tcgplayer-cdn.tcgplayer.com/product/1_400w.jpg" : undefined,
  }),
}));

import { resolveCardImageUrl } from "./artPrefs";

describe("resolveCardImageUrl preview art", () => {
  it("a card with no image URL uses its preview as the primary art (#575)", () => {
    expect(resolveCardImageUrl("OP18-021", null)).toBe("/cards/preview/OP18-021.webp");
    expect(resolveCardImageUrl("OP18-021", { deck: null, size: "large" })).toBe(
      "/cards/preview/OP18-021.webp",
    );
  });

  it("a card with TCGPlayer art or no preview does not use a preview (#575)", () => {
    expect(resolveCardImageUrl("OP01-016", null)).toBe(
      "https://tcgplayer-cdn.tcgplayer.com/product/1_400w.jpg",
    );
    // OP18-031 has a preview file too, but its real art stays the primary.
    expect(resolveCardImageUrl("OP18-031", null)).toBe(
      "https://tcgplayer-cdn.tcgplayer.com/product/1_400w.jpg",
    );
    expect(resolveCardImageUrl("OP01-099", null)).toBeUndefined();
  });
});
