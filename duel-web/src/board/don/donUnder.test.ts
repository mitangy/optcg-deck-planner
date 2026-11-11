import { describe, expect, it } from "vitest";
import { DON_UNDER_MAX_LAYERS, donFanOrder, donUnderLayers } from "./donUnder";

describe("donUnderLayers", () => {
  it("draws one DON!! layer per attached DON!! up to the cap (#251)", () => {
    expect(donUnderLayers(0)).toEqual([]);
    expect(donUnderLayers(-2)).toEqual([]);
    expect(donUnderLayers(1)).toHaveLength(1);
    expect(donUnderLayers(3)).toHaveLength(3);
    expect(donUnderLayers(DON_UNDER_MAX_LAYERS + 4)).toHaveLength(DON_UNDER_MAX_LAYERS);
  });

  it("fans each layer further out than the one before it (#251)", () => {
    const layers = donUnderLayers(4);
    for (let i = 1; i < layers.length; i++) {
      expect(layers[i].dx).toBeGreaterThan(layers[i - 1].dx);
      expect(layers[i].dy).toBeGreaterThan(layers[i - 1].dy);
    }
  });

  it("tightens the spacing as the count grows (#251)", () => {
    const step = (n: number) => donUnderLayers(n)[0].dy;
    expect(step(2)).toBeLessThan(step(1));
    expect(step(DON_UNDER_MAX_LAYERS)).toBeLessThan(step(2));
  });
});

describe("donFanOrder", () => {
  const z = (s: ReturnType<typeof donFanOrder>, k: string) => Number((s as Record<string, number>)[k]);

  it("puts a rested card's DON!! under a standing neighbour when both fan at each other (#1249)", () => {
    // Your standing Karoo (fans to the next card) beside your rested Chopper (fans back to it).
    const standing = donFanOrder(0, 4, false);
    const rested = donFanOrder(1, 4, true);
    expect(z(rested, "--fan-z-prev")).toBeLessThan(z(standing, "--fan-z-next"));
  });

  it("stacks same-direction fans under the card they point at (#1249)", () => {
    for (const rested of [false, true]) {
      for (let i = 0; i < 4; i++) {
        const a = donFanOrder(i, 5, rested);
        const b = donFanOrder(i + 1, 5, rested);
        expect(z(a, "--fan-z-next")).toBeLessThan(z(b, "--fan-z-next"));
        expect(z(b, "--fan-z-prev")).toBeLessThan(z(a, "--fan-z-prev"));
      }
    }
  });

  it("keeps a card with no DON!! above every fan in the row (#1249)", () => {
    const n = 5;
    const top = z(donFanOrder(0, n, false), "--fan-z-top");
    for (let i = 0; i < n; i++) {
      for (const rested of [false, true]) {
        const s = donFanOrder(i, n, rested);
        expect(z(s, "--fan-z-next")).toBeLessThan(top);
        expect(z(s, "--fan-z-prev")).toBeLessThan(top);
      }
    }
  });
});
