/**
 * Pure math for the upload editor: an image is rotated / flipped / zoomed and
 * panned under a fixed-aspect crop frame. No DOM access, so it runs in node.
 */

export type EditState = {
  /** Clockwise quarter turns, 0–3. */
  rot: number;
  flipH: boolean;
  flipV: boolean;
  /** 1 = image just covers the frame; larger zooms in. */
  zoom: number;
  /** Image-center offset from the frame center, in frame pixels. */
  panX: number;
  panY: number;
};

export const INITIAL_EDIT: EditState = {
  rot: 0,
  flipH: false,
  flipV: false,
  zoom: 1,
  panX: 0,
  panY: 0,
};

export const MAX_ZOOM = 4;

/** Image size after the quarter-turn rotation. */
export function rotatedSize(w: number, h: number, rot: number): { w: number; h: number } {
  return rot % 2 === 0 ? { w, h } : { w: h, h: w };
}

/** Pixels per source pixel at zoom 1 (smallest scale that covers the frame). */
export function coverScale(
  imgW: number,
  imgH: number,
  rot: number,
  frameW: number,
  frameH: number,
): number {
  const r = rotatedSize(imgW, imgH, rot);
  return Math.max(frameW / r.w, frameH / r.h);
}

/** Keep the frame fully covered by the image. */
export function clampPan(
  panX: number,
  panY: number,
  imgW: number,
  imgH: number,
  rot: number,
  zoom: number,
  frameW: number,
  frameH: number,
): { panX: number; panY: number } {
  const r = rotatedSize(imgW, imgH, rot);
  const s = coverScale(imgW, imgH, rot, frameW, frameH) * zoom;
  const maxX = Math.max(0, (r.w * s - frameW) / 2);
  const maxY = Math.max(0, (r.h * s - frameH) / 2);
  return {
    panX: Math.min(maxX, Math.max(-maxX, panX)),
    panY: Math.min(maxY, Math.max(-maxY, panY)),
  };
}
