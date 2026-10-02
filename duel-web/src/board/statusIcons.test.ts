import { describe, expect, it } from "vitest";
import { placeTip, splitStatuses, statusGlyph, statusTone, statusTooltip } from "./statusIcons";

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

describe("splitStatuses", () => {
  const labels = ["Blocker", "Rush", "Double Attack", "Banish", "Unblockable"];

  it("shows every label until it has been measured, or when they all fit", () => {
    expect(splitStatuses(labels, null)).toEqual({ shown: labels, hidden: [] });
    expect(splitStatuses(labels, 5)).toEqual({ shown: labels, hidden: [] });
  });

  it("gives the last slot that fits to the +N badge, keeping the first labels", () => {
    expect(splitStatuses(labels, 3)).toEqual({
      shown: ["Blocker", "Rush"],
      hidden: ["Double Attack", "Banish", "Unblockable"],
    });
  });

  it("hides everything behind +N when no slot fits", () => {
    expect(splitStatuses(labels, 0)).toEqual({ shown: [], hidden: labels });
  });
});

describe("status colours and tooltips", () => {
  it("colours disables red, keywords green, sick amber, negation purple (#256)", () => {
    expect(statusTone("Cannot attack")).toBe("disable");
    expect(statusTone("Won't refresh")).toBe("disable");
    expect(statusTone("Stunned")).toBe("disable");
    expect(statusTone("Rush")).toBe("buff");
    expect(statusTone("Blocker")).toBe("buff");
    expect(statusTone("Summoning sick")).toBe("sick");
    expect(statusTone("Rested")).toBe("rested");
    expect(statusTone("Effects negated")).toBe("negated");
    expect(statusTone("Glows softly")).toBe("default");
  });

  it("explains every engine status label in the tooltip (#256)", () => {
    for (const label of [...ENGINE_LABELS, "Rested"]) {
      expect(statusTooltip(label).text, label).toBeTruthy();
    }
    expect(statusTooltip("Glows softly").text).toBeNull();
  });
});

describe("placeTip", () => {
  const tip = { width: 200, height: 40 };
  const vp = { width: 375, height: 700 };
  it("centres above the badge when there is room (#256)", () => {
    expect(placeTip({ left: 150, top: 300, width: 20, height: 20 }, tip, vp)).toEqual({ left: 60, top: 254 });
  });
  it("flips below when the badge is at the top edge (#256)", () => {
    expect(placeTip({ left: 150, top: 10, width: 20, height: 20 }, tip, vp).top).toBe(36);
  });
  it("clamps inside the viewport at the right edge (#256)", () => {
    expect(placeTip({ left: 360, top: 300, width: 14, height: 20 }, tip, vp).left).toBe(167);
  });
});
