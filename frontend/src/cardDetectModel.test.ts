import { describe, expect, it, vi } from "vitest";
import { preferLearned, type DetectedCard } from "./cardDetect";
import {
  CHANNELS,
  decodeDetections,
  detectionsToCards,
  isPlausibleCard,
  letterboxGeometry,
  MODEL_DEFAULTS,
  preprocess,
  resolveOptions,
  suppressDuplicates,
} from "./cardDetectModel";
import { isCurrent } from "./cardDetectorCache";
import type { Pt, Quad } from "./cardRectify";

const rect = (x: number, y: number, w: number, h: number): Quad => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
const card = (x: number, y: number, h = 220): Quad => rect(x, y, (h * 63) / 88, h);

/** A `[1, 17, anchors]` channel-major tensor holding the given detections (network-input pixels). */
function tensor(dets: { score: number; quad: Quad }[]): { data: Float32Array; anchors: number } {
  const n = dets.length;
  const data = new Float32Array(CHANNELS * n);
  dets.forEach((d, i) => {
    data[4 * n + i] = d.score;
    d.quad.forEach((p: Pt, k) => {
      data[(5 + 3 * k) * n + i] = p.x;
      data[(6 + 3 * k) * n + i] = p.y;
      data[(7 + 3 * k) * n + i] = 1;
    });
  });
  return { data, anchors: n };
}

describe("resolveOptions", () => {
  it("treats an option passed as undefined as unset (#701)", () => {
    expect(resolveOptions({ longSide: undefined, scoreThreshold: undefined })).toEqual(resolveOptions());
    expect(resolveOptions({ scoreThreshold: 0.5 }).scoreThreshold).toBe(0.5);
  });
});

describe("letterbox", () => {
  it("pads a portrait photo to a multiple of 32 and centres it (#701)", () => {
    const box = letterboxGeometry(1450, 2576, 640);
    expect(box).toMatchObject({ width: 384, height: 640, innerWidth: 360, innerHeight: 640, padX: 12, padY: 0 });
    expect(box.scale).toBeCloseTo(640 / 2576);
  });

  it("converts a photo to planar RGB in [0,1] with grey padding (#701)", () => {
    // 64x16, left half red, right half blue: padded to 64x32, 8 rows of grey above and below.
    const w = 64;
    const h = 16;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const o = (y * w + x) * 4;
        data[o] = x < 32 ? 255 : 0;
        data[o + 2] = x < 32 ? 0 : 255;
        data[o + 3] = 255;
      }
    }
    const { tensor: t, box } = preprocess({ width: w, height: h, data } as ImageData, 64);
    const plane = box.width * box.height;
    expect(box.padY).toBe(8);
    expect(t[0]).toBeCloseTo(114 / 255); // padding, red plane
    const at = (8 + 4) * box.width; // a photo row, first column
    expect(t[at]).toBe(1); // red plane, red pixel
    expect(t[2 * plane + at]).toBe(0); // blue plane, red pixel
    expect(t[2 * plane + at + 40]).toBe(1); // blue plane, blue pixel
  });

  it("averages when shrinking instead of sampling single pixels (#701)", () => {
    // Alternating black/white columns shrunk 2x must come out mid-grey.
    const w = 64;
    const h = 32;
    const data = new Uint8ClampedArray(w * h * 4).fill(255);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 2) data.fill(0, (y * w + x) * 4, (y * w + x) * 4 + 3);
    const { tensor: t } = preprocess({ width: w, height: h, data } as ImageData, 32);
    expect(t[8 * 32 + 5]).toBeCloseTo(0.5, 2);
  });
});

describe("decodeDetections", () => {
  it("maps network pixels back to source pixels through padding and scale (#701)", () => {
    const box = letterboxGeometry(1450, 2576, 640); // scale 0.2484, padX 12
    const src = rect(300, 900, 270, 380);
    const net = src.map((p) => ({ x: p.x * box.scale + box.padX, y: p.y * box.scale + box.padY })) as Quad;
    const { data, anchors } = tensor([{ score: 0.9, quad: net }]);
    const [d] = decodeDetections(data, anchors, box, 0.3);
    d.quad.forEach((p, i) => {
      expect(p.x).toBeCloseTo(src[i].x, 3);
      expect(p.y).toBeCloseTo(src[i].y, 3);
    });
  });

  it("drops anchors under the score threshold (#701)", () => {
    const box = letterboxGeometry(640, 640, 640);
    const { data, anchors } = tensor([
      { score: 0.29, quad: card(10, 10) },
      { score: 0.31, quad: card(300, 10) },
    ]);
    const out = decodeDetections(data, anchors, box, 0.3);
    expect(out.map((d) => d.score)).toEqual([expect.closeTo(0.31, 5)]);
  });
});

describe("isPlausibleCard", () => {
  it("accepts a card, upright or sideways, and rejects what cannot be one (#701)", () => {
    expect(isPlausibleCard(card(100, 100), 640, 640)).toBe(true);
    expect(isPlausibleCard(rect(100, 100, 220, 157), 640, 640)).toBe(true);
    expect(isPlausibleCard(rect(100, 100, 220, 220), 640, 640)).toBe(false); // square
    const bowtie: Quad = [
      { x: 100, y: 100 },
      { x: 260, y: 320 },
      { x: 260, y: 100 },
      { x: 100, y: 320 },
    ];
    expect(isPlausibleCard(bowtie, 640, 640)).toBe(false);
    expect(isPlausibleCard(card(900, 100), 640, 640)).toBe(false); // far outside the frame
    // One corner dragged in past the opposite diagonal: card-like side lengths, but concave.
    const dart: Quad = [
      { x: 100, y: 100 },
      { x: 257, y: 100 },
      { x: 170, y: 215 },
      { x: 100, y: 320 },
    ];
    expect(isPlausibleCard(dart, 640, 640)).toBe(false);
  });
});

describe("suppressDuplicates", () => {
  it("keeps the highest-scoring of overlapping quads (#701)", () => {
    const kept = suppressDuplicates(
      [
        { score: 0.5, quad: card(102, 100) },
        { score: 0.9, quad: card(100, 100) },
      ],
      0.5,
    );
    expect(kept).toHaveLength(1);
    expect(kept[0].score).toBe(0.9);
  });

  it("merges two detections of one card that disagree by a quarter of its width (#701)", () => {
    const kept = suppressDuplicates(
      [
        { score: 0.9, quad: card(100, 100) },
        { score: 0.8, quad: card(140, 100) },
      ],
      0.5,
    );
    expect(kept).toHaveLength(1);
  });

  it("keeps neighbouring cards that merely touch (#701)", () => {
    const kept = suppressDuplicates(
      [
        { score: 0.9, quad: card(100, 100) },
        { score: 0.8, quad: card(100 + (220 * 63) / 88 + 4, 100) },
      ],
      0.5,
    );
    expect(kept).toHaveLength(2);
  });

  it("drops a smaller quad sitting inside a better one, such as a card's art box (#701)", () => {
    const kept = suppressDuplicates(
      [
        { score: 0.9, quad: card(100, 100, 300) },
        { score: 0.6, quad: rect(130, 160, 120, 100) },
      ],
      0.5,
    );
    expect(kept).toHaveLength(1);
  });

  it("with the shipped threshold keeps a rear card that is 55% visible behind a fan's top card (#769)", () => {
    // The model returns covered cards as full quads, so a rear card shows up as a quad
    // that overlaps the top card's quad (IoU ~0.4 here) but is a different card.
    const top = card(100, 100, 300);
    const rear = card(100 + 0.45 * ((300 * 63) / 88), 100, 300);
    expect(suppressDuplicates([{ score: 0.9, quad: top }, { score: 0.8, quad: rear }], MODEL_DEFAULTS.nmsIoU)).toHaveLength(2);
  });

  it("keeps a card that overlaps another's edge (a fanned pile) (#701)", () => {
    const top = card(100, 100, 300);
    const behind = card(100 + 60, 100 - 40, 300);
    expect(suppressDuplicates([{ score: 0.9, quad: top }, { score: 0.8, quad: behind }], 0.5)).toHaveLength(2);
  });
});

describe("detectionsToCards", () => {
  const box = letterboxGeometry(640, 640, 640);
  const cards = (dets: { score: number; quad: Quad }[]) => {
    const { data, anchors } = tensor(dets);
    return detectionsToCards(data, anchors, box, 640, 640);
  };

  it("returns source-pixel quads in reading order (#701)", () => {
    const found = cards([
      { score: 0.8, quad: card(400, 300) },
      { score: 0.9, quad: card(50, 40) },
      { score: 0.7, quad: card(300, 40) },
    ]);
    expect(found.map((c) => [Math.round(c.quad[0].x), Math.round(c.quad[0].y)])).toEqual([
      [50, 40],
      [300, 40],
      [400, 300],
    ]);
  });

  it("keeps a sideways card's printed corner order but repairs a quarter-turn mix-up (#701)", () => {
    // Printed TL at the photo's top-right: the card lies rotated 90 degrees clockwise.
    const w = 220; // the card's long side now runs across the photo
    const h = 157;
    const x = 200;
    const y = 200;
    const cw: Quad = [
      { x: x + w, y }, // TL
      { x: x + w, y: y + h }, // TR
      { x, y: y + h }, // BR
      { x, y }, // BL
    ];
    expect(cards([{ score: 0.9, quad: cw }])[0].quad).toEqual(cw);
    // Same card reported with corners shifted a quarter turn: long side now runs across.
    const shifted: Quad = [cw[1], cw[2], cw[3], cw[0]];
    expect(cards([{ score: 0.9, quad: shifted }])[0].quad).toEqual(cw);
  });

  it("drops implausible and duplicate detections (#701)", () => {
    expect(
      cards([
        { score: 0.9, quad: card(100, 100) },
        { score: 0.85, quad: card(103, 101) },
        { score: 0.95, quad: rect(300, 300, 200, 200) },
      ]),
    ).toHaveLength(1);
  });
});

describe("preferLearned", () => {
  const found: DetectedCard[] = [{ quad: card(10, 10) }];
  const classical: DetectedCard[] = [{ quad: card(200, 200) }];

  it("uses the model when it finds cards and never runs OpenCV (#701)", () => {
    const run = vi.fn(() => classical);
    expect(preferLearned(found, run)).toBe(found);
    expect(run).not.toHaveBeenCalled();
  });

  it("falls back to the OpenCV detector when the model is missing, failed or found nothing (#701)", () => {
    expect(preferLearned(null, () => classical)).toBe(classical);
    expect(preferLearned([], () => classical)).toBe(classical);
  });
});

describe("cached detector model", () => {
  const pointer = { file: "card-detector-aaaa.onnx", hash: "aaaa", bytes: 8 };
  const stored = (file: string, bytes: number) => ({ pointer: { ...pointer, file }, data: new ArrayBuffer(bytes) });

  it("is current only for the model the pointer names (#701)", () => {
    expect(isCurrent(stored("card-detector-aaaa.onnx", 8), pointer)).toBe(true);
    expect(isCurrent(stored("card-detector-bbbb.onnx", 8), pointer)).toBe(false); // retrained, same size
    expect(isCurrent(stored("card-detector-aaaa.onnx", 4), pointer)).toBe(false); // truncated download
    expect(isCurrent(null, pointer)).toBe(false);
  });
});
