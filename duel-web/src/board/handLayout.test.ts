import { describe, expect, it } from "vitest";
import { spectatorFans, spectatorFarStrip, usesPhoneFan, usesRailHand } from "./handLayout";

describe("hand layout (#271)", () => {
  it("portrait phones keep the fan when the hand grows past 8 cards (#445)", () => {
    // Hand sizes are not an input: a 9+ card hand used to flip to the scrolling Grid whatever the setting said.
    expect(usesPhoneFan(false, "fan")).toBe(true);
    expect(usesPhoneFan(false, "auto")).toBe(true);
  });

  it("the Grid layout never fans (#271)", () => {
    expect(usesPhoneFan(false, "grid")).toBe(false);
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

describe("spectator hand fans (#346)", () => {
  it("revealed hands fan on every layout, hidden hands never do (#346)", () => {
    expect(spectatorFans(true, true, false)).toBe("desktop");
    expect(spectatorFans(true, false, false)).toBe("portrait");
    expect(spectatorFans(true, true, true)).toBe("landscape");
    expect(spectatorFans(false, true, false)).toBeNull();
    expect(spectatorFans(false, false, false)).toBeNull();
  });

  it("the far strip on a portrait phone fans up to 8 cards and scrolls a bigger hand (#346)", () => {
    expect(spectatorFarStrip(8)).toBe("fan");
    expect(spectatorFarStrip(9)).toBe("scroll");
  });
});
