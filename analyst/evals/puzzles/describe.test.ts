import { describe, expect, it } from "vitest";
import { loadCatalog } from "../../src/catalog";
import { assemble, countedList, fullySupported } from "./describe";
import { MESSAGE_LIMIT } from "./types";

const catalog = loadCatalog();
/** A catalog with `n` cards whose rules text is 390 characters long (the reference line itself cuts at 400). */
const wordy = (n: number) => {
  const cards = new Map(catalog.cards);
  const ids = Array.from({ length: n }, (_, i) => `ZZ01-${String(i + 1).padStart(3, "0")}`);
  for (const id of ids) cards.set(id, { ...catalog.cards.get("ST01-003")!, id, name: `Wordy ${id}`, text: "x".repeat(390) });
  return { catalog: { ...catalog, cards }, ids };
};

describe("assembling a puzzle message", () => {
  it("cuts card text shorter to fit the size bound, and gives up when even that is too long (#677)", () => {
    const few = wordy(10);
    const fits = assemble(few.catalog, ["Position"], few.ids, "Q?", '{"a": 1}')!;
    expect(fits.message).not.toContain("…");
    const many = wordy(18);
    const cut = assemble(many.catalog, ["Position"], many.ids, "Q?", '{"a": 1}')!;
    expect(cut).toBeDefined();
    expect(cut.message.length).toBeLessThanOrEqual(MESSAGE_LIMIT);
    expect(cut.message).toContain("…");
    const huge = wordy(60);
    expect(assemble(huge.catalog, ["Position"], huge.ids, "Q?", '{"a": 1}')).toBeUndefined();
  });

  it("puts the position, the card reference, the question and the answer format in that order (#677)", () => {
    const made = assemble(catalog, ["Head line"], ["ST01-003"], "Which?", '{"a": 1}')!;
    const at = (s: string) => made.message.indexOf(s);
    expect(at("Head line")).toBeLessThan(at("Card reference:"));
    expect(at("Card reference:")).toBeLessThan(at("- ST01-003 Karoo"));
    expect(at("- ST01-003 Karoo")).toBeLessThan(at("Question: Which?"));
    expect(at("Question: Which?")).toBeLessThan(at('```json\n{"a": 1}\n```'));
    expect(made.position).toBe("Head line\n\nCard reference:\n- ST01-003 Karoo (character, red, cost 1, power 3000, counter 1000, traits: Animal/Alabasta)");
  });

  it("lists a repeated card once with its count (#677)", () => {
    expect(countedList(catalog, ["ST01-003", "ST01-009", "ST01-003"])).toBe("Karoo (ST01-003) x2, Nefeltari Vivi (ST01-009)");
  });

  it("treats a card the engine only half implements as not fully supported (#677)", () => {
    const partial = [...catalog.cards.values()].find((c) => c.support === "partial")!.id;
    expect(fullySupported(catalog, ["ST01-003", "OP18-001"])).toBe(true);
    expect(fullySupported(catalog, ["ST01-003", partial])).toBe(false);
    expect(fullySupported(catalog, ["ZZ99-999"])).toBe(false);
  });
});
