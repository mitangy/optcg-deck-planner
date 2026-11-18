import { describe, expect, it } from "vitest";
import { clampPan, coverScale } from "./cropTransform";

describe("cropTransform", () => {
  it("covers the frame using the rotated image size", () => {
    expect(coverScale(400, 100, 0, 200, 100)).toBe(1);
    expect(coverScale(400, 100, 1, 200, 100)).toBe(2);
  });

  it("clamps panning so no empty frame edge shows", () => {
    expect(clampPan(999, -999, 400, 100, 0, 2, 200, 100)).toEqual({ panX: 300, panY: -50 });
    expect(clampPan(10, 10, 400, 100, 0, 2, 200, 100)).toEqual({ panX: 10, panY: 10 });
    expect(clampPan(99, 999, 400, 100, 1, 1, 200, 100)).toEqual({ panX: 0, panY: 350 });
  });

  it("allows no pan on an axis the image only just covers", () => {
    expect(clampPan(50, 50, 200, 100, 0, 1, 200, 100)).toEqual({ panX: 0, panY: 0 });
  });
});
