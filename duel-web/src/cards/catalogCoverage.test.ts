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
  // OP18 Baroque Works cards added from the Limitless English pages (#1248).
  "OP18-049",
  "OP18-050",
  "OP18-053",
  "OP18-054",
  "OP18-057",
  // OP18 cards added from the Limitless English pages (#1274) before TCGPlayer listed them.
  "OP18-002",
  "OP18-005",
  "OP18-006",
  "OP18-007",
  "OP18-008",
  "OP18-009",
  "OP18-012",
  "OP18-014",
  "OP18-019",
  "OP18-023",
  "OP18-026",
  "OP18-030",
  "OP18-033",
  "OP18-035",
  "OP18-037",
  "OP18-039",
  "OP18-042",
  "OP18-043",
  "OP18-045",
  "OP18-062",
  "OP18-067",
  "OP18-068",
  "OP18-071",
  "OP18-072",
  "OP18-073",
  "OP18-074",
  "OP18-080",
  "OP18-081",
  "OP18-082",
  "OP18-087",
  "OP18-090",
  "OP18-095",
  "OP18-097",
  "OP18-098",
  "OP18-099",
  "OP18-102",
  "OP18-104",
  "OP18-105",
  "OP18-107",
  "OP18-109",
  "OP18-114",
  "OP18-115",
  "OP18-118",
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
