import { describe, expect, it } from "vitest";
import { buildMassEntryExport, MASS_ENTRY_URL_MAX_LEN } from "./tcgplayerMassEntry";

describe("buildMassEntryExport", () => {
  it("prefers product ids and skips zero qty", () => {
    const result = buildMassEntryExport([
      { card_id: "OP01-001", name: "Luffy", still_need: 3, product_id: 100 },
      { card_id: "OP01-002", name: "Zoro", still_need: 0, product_id: 200 },
      { card_id: "OP01-003", name: "Nami", still_need: 2, product_id: null },
    ]);
    expect(result.pasteText).toBe("3-100\n2 Nami OP01-003");
    expect(result.url).toContain("3-100");
    expect(result.includedCount).toBe(2);
    expect(result.missingProductId).toBe(1);
  });

  it("omits url when the list is too long", () => {
    const cards = Array.from({ length: 200 }, (_, i) => ({
      card_id: `OP09-${String(i).padStart(3, "0")}`,
      name: `Card ${i}`,
      still_need: 4,
      product_id: 600000 + i,
    }));
    const result = buildMassEntryExport(cards);
    expect(result.url).toBeNull();
    expect(result.pasteText.split("\n")).toHaveLength(200);
    expect(MASS_ENTRY_URL_MAX_LEN).toBeGreaterThan(1000);
  });
});
