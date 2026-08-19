import { describe, expect, it } from "vitest";
import { guideCropInVideoSpace } from "./CardCaptureLive";

/** Stand-ins for the two elements; only the geometry matters. */
function video(videoWidth: number, videoHeight: number, box: DOMRectLike): HTMLVideoElement {
  return {
    videoWidth,
    videoHeight,
    getBoundingClientRect: () => box,
  } as unknown as HTMLVideoElement;
}

function guide(box: DOMRectLike | null): HTMLElement | null {
  return box ? ({ getBoundingClientRect: () => box } as unknown as HTMLElement) : null;
}

type DOMRectLike = { left: number; top: number; width: number; height: number };
const rect = (left: number, top: number, width: number, height: number): DOMRectLike => ({
  left,
  top,
  width,
  height,
});

describe("guideCropInVideoSpace", () => {
  it("falls back to the whole frame when the guide has not laid out", () => {
    const v = video(1920, 1080, rect(0, 0, 390, 844));
    expect(guideCropInVideoSpace(v, guide(null))).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
  });

  it("maps a centred guide to the centre of the frame", () => {
    // Element 400x800; frame 1000x1000. cover scale = max(0.4, 0.8) = 0.8,
    // so the frame shows 800x800 and 400px of width is cropped (200 each side).
    const v = video(1000, 1000, rect(0, 0, 400, 800));
    const crop = guideCropInVideoSpace(v, guide(rect(100, 300, 200, 200)));
    // Guide centre is the element centre, so the crop must be frame-centred.
    expect(crop.x + crop.width / 2).toBeCloseTo(500, 5);
    expect(crop.y + crop.height / 2).toBeCloseTo(500, 5);
  });

  it("undoes the cover scale, so the crop is larger in frame pixels", () => {
    const v = video(1000, 1000, rect(0, 0, 400, 800));
    const crop = guideCropInVideoSpace(v, guide(rect(100, 300, 200, 200)));
    // 200 CSS px at scale 0.8 is 250 frame px, plus 6% margin on each side.
    expect(crop.width).toBeCloseTo(250 * 1.12, 5);
    expect(crop.height).toBeCloseTo(250 * 1.12, 5);
  });

  it("accounts for the horizontally cropped overflow", () => {
    // Same geometry, but the guide sits hard against the element's left edge.
    // 200px of frame width is hidden on that side, so the crop must start
    // there rather than at 0 — this is the bug that would silently shift the
    // captured region away from what the user framed.
    const v = video(1000, 1000, rect(0, 0, 400, 800));
    const crop = guideCropInVideoSpace(v, guide(rect(0, 300, 200, 200)));
    const marginPx = (200 * 0.06) / 0.8;
    expect(crop.x).toBeCloseTo(200 / 0.8 - marginPx, 5);
  });

  it("offsets by the element's own position on the page", () => {
    const flush = video(1000, 1000, rect(0, 0, 400, 800));
    const shifted = video(1000, 1000, rect(50, 25, 400, 800));
    const a = guideCropInVideoSpace(flush, guide(rect(100, 300, 200, 200)));
    // Same guide position *relative to the element* must give the same crop.
    const b = guideCropInVideoSpace(shifted, guide(rect(150, 325, 200, 200)));
    expect(b.x).toBeCloseTo(a.x, 5);
    expect(b.y).toBeCloseTo(a.y, 5);
  });

  it("never asks for pixels outside the frame", () => {
    // A guide larger than the frame would otherwise produce a crop running
    // past the edge, which makes drawImage yield a blank canvas.
    const v = video(200, 200, rect(0, 0, 400, 800));
    const crop = guideCropInVideoSpace(v, guide(rect(-50, -50, 500, 900)));
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.y).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.width).toBeLessThanOrEqual(200);
    expect(crop.y + crop.height).toBeLessThanOrEqual(200);
  });
});
