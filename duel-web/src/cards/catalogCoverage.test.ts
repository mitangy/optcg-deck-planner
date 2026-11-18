import { describe, expect, it } from "vitest";
import { isTcgplayerCdnUrl } from "@optcg/ui/cardArt";
import atlas from "../assets/cardAtlas.json";
import catalog from "../assets/cardCatalog.json";

type CatalogRow = { productId?: number; imageUrl?: string };
const rows = catalog as Record<string, CatalogRow>;

const NO_TCGPLAYER_PRODUCT_YET: string[] = [];

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
