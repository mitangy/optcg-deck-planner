import { describe, expect, it } from "vitest";
import { DON_UNDER_MAX_LAYERS, donUnderLayers } from "./donUnder";

describe("donUnderLayers", () => {
  it("draws one DON!! layer per attached DON!! up to the cap (#PR_D)", () => {
    expect(donUnderLayers(0)).toEqual([]);
    expect(donUnderLayers(-2)).toEqual([]);
    expect(donUnderLayers(1)).toHaveLength(1);
    expect(donUnderLayers(3)).toHaveLength(3);
    expect(donUnderLayers(DON_UNDER_MAX_LAYERS + 4)).toHaveLength(DON_UNDER_MAX_LAYERS);
  });

  it("fans each layer further out than the one before it (#PR_D)", () => {
    const layers = donUnderLayers(4);
    for (let i = 1; i < layers.length; i++) {
      expect(layers[i].dx).toBeGreaterThan(layers[i - 1].dx);
      expect(layers[i].dy).toBeGreaterThan(layers[i - 1].dy);
    }
  });

  it("tightens the spacing as the count grows (#PR_D)", () => {
    const step = (n: number) => donUnderLayers(n)[0].dy;
    expect(step(2)).toBeLessThan(step(1));
    expect(step(DON_UNDER_MAX_LAYERS)).toBeLessThan(step(2));
  });
});
