import { describe, expect, it } from "vitest";
import { formatPowerDelta, powerBreakdown, tileStatusLabels } from "./powerDisplay";

describe("powerBreakdown", () => {
  it("splits live power into printed base and modifier", () => {
    expect(powerBreakdown(7000, 5000, 5000)).toEqual({ base: 5000, current: 7000, delta: 2000 });
    expect(powerBreakdown(4000, 5000, 5000)).toEqual({ base: 5000, current: 4000, delta: -1000 });
  });

  it("falls back to atlas power (hand cards) and live power", () => {
    expect(powerBreakdown(undefined, undefined, 3000)).toEqual({ base: 3000, current: 3000, delta: 0 });
    expect(powerBreakdown(6000, null, undefined)).toEqual({ base: 6000, current: 6000, delta: 0 });
  });

  it("returns null for cards without power", () => {
    expect(powerBreakdown(undefined, null, undefined)).toBeNull();
  });
});

describe("formatPowerDelta", () => {
  it("signs the delta", () => {
    expect(formatPowerDelta(2000)).toBe("+2000");
    expect(formatPowerDelta(-1000)).toBe("−1000");
  });
});

describe("tileStatusLabels", () => {
  it("drops the Rested chip when the card is rotated", () => {
    expect(tileStatusLabels(["Rested", "Stun"], true)).toEqual(["Stun"]);
    expect(tileStatusLabels(undefined, true)).toEqual([]);
  });

  it("keeps labels on active cards", () => {
    expect(tileStatusLabels(["Blocker"], false)).toEqual(["Blocker"]);
  });
});
