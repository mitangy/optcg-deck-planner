import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PATCH_NOTES } from "./notes";

type Entry = { imageUrl: string; altArts?: { label: string; imageUrl: string }[] };
const catalog = JSON.parse(readFileSync(new URL("../../../duel-web/src/assets/cardCatalog.json", import.meta.url), "utf8")) as Record<string, Entry>;

describe("note cards (#1367)", () => {
  it("every tagged card uses the catalog art for that id, with the matching alt label (#1367)", () => {
    const tagged = PATCH_NOTES.flatMap((n) => n.cards ?? []);
    expect(tagged.length).toBeGreaterThan(10);
    for (const card of tagged) {
      const entry = catalog[card.id];
      expect(entry, `${card.id} is in the catalog`).toBeDefined();
      if (card.image === entry.imageUrl) {
        expect(card.label, `${card.id} base art has no label`).toBeUndefined();
        continue;
      }
      const alt = entry.altArts?.find((a) => a.imageUrl === card.image);
      expect(alt, `${card.id} image ${card.image} is neither the base nor an alt art`).toBeDefined();
      if (card.label !== undefined) expect(card.label).toBe(alt!.label);
    }
  });
});
