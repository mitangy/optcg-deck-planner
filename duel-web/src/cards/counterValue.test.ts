import { describe, expect, it } from "vitest";
import { listAtlasIds, lookupCard } from "./atlas";
import {
  counterClause,
  counterValueFor,
  formatCounter,
  parseEventCounter,
} from "./counterValue";

describe("counterClause", () => {
  it("stops at the [Trigger] clause", () => {
    expect(
      counterClause(
        "[Counter] Up to 1 of your Leader or Character cards gains +2000 power during this battle.\n\n[Trigger] Up to 1 of your Leader or Character cards gains +1000 power during this turn.",
      ),
    ).toBe("Up to 1 of your Leader or Character cards gains +2000 power during this battle.");
  });

  it("returns null without a [Counter] tag", () => {
    expect(counterClause("[Main] Draw 2 cards.")).toBeNull();
    expect(counterClause(undefined)).toBeNull();
  });
});

describe("parseEventCounter", () => {
  it("reads a plain +power counter", () => {
    expect(
      parseEventCounter(
        "[Counter] Up to 1 of your Leader or Character cards gains +4000 power during this battle.",
      ),
    ).toEqual({ base: 4000 });
  });

  it("ignores the [Trigger] buff", () => {
    expect(
      parseEventCounter(
        "[Counter] Up to 1 of your Leader or Character cards gains +2000 power during this battle. [Trigger] Up to 1 of your Leader or Character cards gains +1000 power during this turn.",
      ),
    ).toEqual({ base: 2000 });
  });

  it("adds a conditional 'additional' bonus as the boosted value", () => {
    expect(
      parseEventCounter(
        "[Counter] Up to 1 of your Leader or Character cards gains +2000 power during this battle. Then, if you have 2 or less Life cards, that card gains an additional +2000 power.",
      ),
    ).toEqual({ base: 2000, boosted: 4000 });
    expect(
      parseEventCounter(
        "[Counter] Up to 1 of your Leader or Character cards gains +4000 power during this battle. Then, if you have 10 or more cards in your trash, that card gains an additional +2000 power during this battle.",
      ),
    ).toEqual({ base: 4000, boosted: 6000 });
  });

  it("treats a conditional second target buff as boosted", () => {
    expect(
      parseEventCounter(
        "[Counter] Up to 1 of your Leader or Character cards gains +3000 power during this battle. Then, if your opponent has 2 or less Life cards, up to 1 of your Leader or Character cards gains +1000 power during this turn.",
      ),
    ).toEqual({ base: 3000, boosted: 4000 });
  });

  it("uses the replacement amount for 'instead'", () => {
    expect(
      parseEventCounter(
        "[Counter] Up to 1 of your Leader or Character cards gains +2000 power during this battle. If you have 3 or more Characters, that card gains +4000 power instead.",
      ),
    ).toEqual({ base: 2000, boosted: 4000 });
  });

  it("folds unconditional follow-up bonuses into the base", () => {
    expect(
      parseEventCounter(
        "[Counter] DON!! −1: If your Leader has the {Donquixote Pirates} type, up to 1 of your Leader or Character cards gains +2000 power during this battle. Then, that card gains an additional +2000 power during this turn.",
      ),
    ).toEqual({ base: 4000 });
  });

  it("marks per-card scaling bonuses", () => {
    expect(
      parseEventCounter(
        "[Counter] Your Leader gains +1000 power during this turn. Then, you may K.O. any number of your {Thriller Bark Pirates} type Characters with a cost of 2 or less. Your Leader gains an additional +1000 power during this turn for every Character K.O.'d.",
      ),
    ).toEqual({ base: 1000, scaling: true });
  });

  it("flags effect-only counter events", () => {
    expect(
      parseEventCounter(
        "[Counter] K.O. up to 1 of your opponent's Characters with 6000 base power or less.",
      ),
    ).toEqual({ base: 0, effectOnly: true });
  });

  it("returns null for non-counter events", () => {
    expect(parseEventCounter("[Main] K.O. up to 1 of your opponent's Characters.")).toBeNull();
  });
});

describe("counterValueFor / formatCounter", () => {
  it("prefers the printed Counter value on characters", () => {
    const v = counterValueFor({ type: "character", counter: 1000, effectText: "" });
    expect(v).toEqual({ base: 1000, source: "printed" });
    expect(formatCounter(v!)).toBe("+1000");
  });

  it("returns null for characters without a counter", () => {
    expect(counterValueFor({ type: "character", effectText: "[Blocker]" })).toBeNull();
  });

  it("formats boosted, scaling and effect-only values", () => {
    expect(formatCounter({ base: 2000, boosted: 4000, source: "event" })).toBe("+2000 / +4000");
    expect(formatCounter({ base: 1000, scaling: true, source: "event" })).toBe("+1000+");
    expect(formatCounter({ base: 0, effectOnly: true, source: "event" })).toBe("Counter");
  });

  it("reads real atlas cards", () => {
    expect(formatCounter(counterValueFor(lookupCard("OP01-029"))!)).toBe("+2000 / +4000");
  });

  it("parses every [Counter] event in the atlas", () => {
    let seen = 0;
    for (const id of listAtlasIds()) {
      const e = lookupCard(id);
      if (e.type !== "event" || !/\[Counter\]/.test(e.effectText ?? "")) continue;
      seen++;
      const v = counterValueFor(e);
      expect(v, id).not.toBeNull();
      if (/gains? \+\d+ power/.test(counterClause(e.effectText) ?? "")) {
        expect(v!.base, id).toBeGreaterThan(0);
      }
      if (v!.boosted != null) expect(v!.boosted, id).toBeGreaterThan(v!.base);
    }
    expect(seen).toBeGreaterThan(50);
  });
});
