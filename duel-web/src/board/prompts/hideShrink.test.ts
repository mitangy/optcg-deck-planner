import { describe, expect, it } from "vitest";
import { shrinkTransform } from "./hideShrink";

describe("shrinkTransform", () => {
  const popup = { left: 400, top: 250, width: 460, height: 300 };

  it("fits a wide pop-up into a short pill by the tighter side and centres it on the pill (#587)", () => {
    const pill = { left: 560, top: 12, width: 230, height: 36 };
    const { x, y, scale } = shrinkTransform(popup, pill);
    // Height decides (36 / 300), not width (230 / 460).
    expect(scale).toBeCloseTo(0.12, 5);
    // The scaled box (55.2 x 36) sits in the pill's middle.
    expect(x).toBeCloseTo(560 + (230 - 55.2) / 2 - 400, 5);
    expect(y).toBeCloseTo(12 - 250, 5);
  });

  it("fits by width when the pill is narrower than the pop-up is wide in proportion (#587)", () => {
    const pill = { left: 100, top: 600, width: 46, height: 200 };
    const { x, y, scale } = shrinkTransform(popup, pill);
    expect(scale).toBeCloseTo(0.1, 5);
    expect(x).toBeCloseTo(100 - 400, 5);
    expect(y).toBeCloseTo(600 + (200 - 30) / 2 - 250, 5);
  });

  it("lands the pop-up's top-left corner on the pill when the shapes match (#587)", () => {
    expect(shrinkTransform(popup, { left: 20, top: 30, width: 230, height: 150 })).toEqual({ x: -380, y: -220, scale: 0.5 });
  });
});
