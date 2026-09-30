import { describe, expect, it } from "vitest";
import { statusGlyph } from "./statusIcons";

// Labels exactly as the rules engine emits them (packages/rules/src/engine/views.ts cardView).
const ENGINE_LABELS = [
  "Effects negated",
  "Cannot attack",
  "Summoning sick",
  "Blocker",
  "Rush",
  "Rush: Character",
  "Double Attack",
  "Banish",
  "Unblockable",
  "Won't refresh",
];

describe("statusGlyph", () => {
  it("gives every engine status label an icon", () => {
    for (const label of ENGINE_LABELS) expect(statusGlyph(label), label).not.toBeNull();
  });

  it("gives distinct statuses distinct icons", () => {
    const glyphs = ENGINE_LABELS.map((l) => statusGlyph(l)!.glyph);
    expect(new Set(glyphs).size).toBe(ENGINE_LABELS.length);
  });

  it("keeps Rush and Rush: Character apart", () => {
    expect(statusGlyph("Rush")!.glyph).not.toBe(statusGlyph("Rush: Character")!.glyph);
  });

  it("leaves unknown labels to the text chip", () => {
    expect(statusGlyph("Glows softly")).toBeNull();
    expect(statusGlyph("")).toBeNull();
  });

  it("treats Stun and Stunned (free-form card labels) as the same status", () => {
    expect(statusGlyph("Stunned")).toEqual(statusGlyph("Stun"));
    expect(statusGlyph("Stun")).not.toBeNull();
  });

  it("matches loosely on case, spacing and apostrophe style", () => {
    for (const [loose, exact] of [
      ["summoning  SICK ", "Summoning sick"],
      ["Won\u2019t refresh", "Won't refresh"],
      ["Rush:Character", "Rush: Character"],
    ]) {
      // Both sides non-null, otherwise two misses would compare equal.
      expect(statusGlyph(exact), exact).not.toBeNull();
      expect(statusGlyph(loose), loose).toEqual(statusGlyph(exact));
    }
  });
});
