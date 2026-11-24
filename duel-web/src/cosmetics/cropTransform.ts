export type EditState = {
  rot: number;
  flipH: boolean;
  flipV: boolean;
  zoom: number;
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

export function rotatedSize(w: number, h: number, rot: number): { w: number; h: number } {
  return rot % 2 === 0 ? { w, h } : { w: h, h: w };
}

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
