import { describe, expect, it } from "vitest";
import { isTcgplayerCdnUrl } from "@optcg/ui/cardArt";
import atlas from "../assets/cardAtlas.json";
import catalog from "../assets/cardCatalog.json";

type CatalogRow = { productId?: number; imageUrl?: string };
const rows = catalog as Record<string, CatalogRow>;

/**
 * Engine cards that TCGPlayer has no product for yet. Leave empty unless a card truly has none;
 * add its id here with the reason, and remove it once the product exists and the row is added
 * (the second assertion fails on a stale entry).
 */
const NO_TCGPLAYER_PRODUCT_YET: string[] = [
  // OP18 cards added from the Japanese card pages (#1189) before TCGPlayer listed them.
  "OP18-004",
  "OP18-011",
  "OP18-020",
  "OP18-027",
  "OP18-034",
  "OP18-046",
  "OP18-048",
  "OP18-061",
  "OP18-064",
  "OP18-065",
  "OP18-078",
  "OP18-083",
  "OP18-084",
  "OP18-088",
  "OP18-093",
  "OP18-100",
  "OP18-103",
  "OP18-112",
  "OP18-113",
  "OP18-117",
];

function hasTcgplayerArt(id: string): boolean {
  const row = rows[id];
  return typeof row?.productId === "number" && isTcgplayerCdnUrl(row.imageUrl ?? "");
}

describe("catalog coverage", () => {
  it("every engine card has a catalog row with a TCGPlayer image (#670)", () => {
    const missing = Object.keys(atlas).filter(
      (id) => !NO_TCGPLAYER_PRODUCT_YET.includes(id) && !hasTcgplayerArt(id),
    );
    expect(missing).toEqual([]);
    const stale = NO_TCGPLAYER_PRODUCT_YET.filter(hasTcgplayerArt);
    expect(stale).toEqual([]);
  });
});
