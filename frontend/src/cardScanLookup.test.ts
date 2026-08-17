import { describe, expect, it, vi } from "vitest";
import { resolveScanWithCatalog } from "./cardScanLookup";

type Row = { card_id: string; name: string };

const CATALOG: Row[] = [
  { card_id: "OP01-001", name: "Roronoa Zoro (001)" },
  { card_id: "OP01-005", name: "Uta" },
  { card_id: "OP01-006", name: "Otama (Reprint)" },
  { card_id: "OP01-008", name: "Cavendish" },
  { card_id: "OP01-016", name: "Nami" },
  { card_id: "OP01-106", name: "Jinbe" },
];

/** Mimics the API's `card_id ILIKE %q%` behaviour. */
function fakeLookup(rows: Row[] = CATALOG) {
  return vi.fn(async (q: string) =>
    rows.filter((r) => r.card_id.toUpperCase().includes(q.toUpperCase())),
  );
}

describe("resolveScanWithCatalog", () => {
  it("resolves a clean read in a single query", async () => {
    const lookup = fakeLookup();
    const out = await resolveScanWithCatalog("Otama (Reprint) OP01-006 ©BANDAI", lookup);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.card.card_id).toBe("OP01-006");
    expect(out.confidence).toBe("exact");
    expect(out.queries).toBe(1);
    expect(lookup).toHaveBeenCalledWith("OP01-006");
  });

  it("repairs a letter/digit misread without widening", async () => {
    const lookup = fakeLookup();
    const out = await resolveScanWithCatalog("Nami 0P01-O16", lookup);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.card.card_id).toBe("OP01-016");
    expect(out.queries).toBe(1);
  });

  it("widens when the printed name contradicts a valid id", async () => {
    const lookup = fakeLookup();
    // OP01-008 is a real card (Cavendish), but the face says Otama.
    const out = await resolveScanWithCatalog("Otama (Reprint) OP01-008", lookup);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.card.card_id).toBe("OP01-006");
    expect(out.confidence).toBe("fuzzy");
    expect(out.queries).toBeGreaterThan(1);
  });

  it("reports when no card id is present at all", async () => {
    const lookup = fakeLookup();
    const out = await resolveScanWithCatalog("Straw Hat Crew", lookup);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("no-card-id");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("reports when the id is well-formed but absent from the catalog", async () => {
    const lookup = fakeLookup();
    const out = await resolveScanWithCatalog("OP99-999", lookup);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("not-in-catalog");
    expect(out.candidate).toBe("OP99-999");
  });

  it("rejects a repaired id whose printed name disagrees", async () => {
    const lookup = fakeLookup();
    // Real regression: "Borsalino OP16-073" misread as 0P16-072. Repairing the
    // O fixes the prefix but leaves the wrong card, which is a real id — only
    // the name reveals it. Here Otama's number is misread onto Cavendish.
    const out = await resolveScanWithCatalog("Otama (Reprint) 0P01-008", lookup);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.card.card_id).toBe("OP01-006");
  });

  it("keeps an unconfirmed id when widening finds nothing better", async () => {
    const lookup = fakeLookup();
    // Name is unreadable (glare); the id itself is real and stays.
    const out = await resolveScanWithCatalog("OP01-005", lookup);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.card.card_id).toBe("OP01-005");
  });
});
