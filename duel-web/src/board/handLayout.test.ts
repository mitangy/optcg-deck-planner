import { describe, expect, it } from "vitest";
import { usesPhoneFan, usesRailHand } from "./handLayout";

describe("hand layout (#271)", () => {
  it("portrait phones fan up to 8 cards and scroll a bigger hand (#271)", () => {
    expect(usesPhoneFan(false, "fan", 8)).toBe(true);
    expect(usesPhoneFan(false, "fan", 9)).toBe(false);
  });

  it("the Grid layout never fans (#271)", () => {
    expect(usesPhoneFan(false, "grid", 5)).toBe(false);
  });

  it("landscape phones keep the hand in the right column, even in a short window (#271)", () => {
    expect(usesRailHand(true, true, false, false)).toBe(true);
    expect(usesRailHand(true, true, false, true)).toBe(true);
  });

  it("desktop only uses the rail hand when tall and not fanned (#271)", () => {
    expect(usesRailHand(true, false, true, false)).toBe(true);
    expect(usesRailHand(true, false, true, true)).toBe(false);
    expect(usesRailHand(true, false, false, false)).toBe(false);
    expect(usesRailHand(false, false, true, false)).toBe(false);
  });
});
