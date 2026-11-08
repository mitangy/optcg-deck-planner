import { describe, expect, it } from "vitest";
import { fitPopupScale } from "./useFitPopupScale";

describe("fitting a scaled pop-up to its layer (#555)", () => {
  it("keeps the chosen size while it fits (#555)", () => {
    expect(fitPopupScale(1.6, 300, 600)).toBe(1.6);
  });

  it("shrinks the size to the biggest one whose height still fits (#555)", () => {
    expect(fitPopupScale(1.6, 500, 600)).toBeCloseTo(1.2, 5);
  });

  it("never goes below 100% and leaves smaller sizes alone (#555)", () => {
    expect(fitPopupScale(1.6, 900, 600)).toBe(1);
    expect(fitPopupScale(0.7, 900, 600)).toBe(0.7);
  });
});
