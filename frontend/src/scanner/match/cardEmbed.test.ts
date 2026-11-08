import { describe, expect, it } from "vitest";
import {
  EMBED_H,
  EMBED_SCALE,
  EMBED_W,
  decodeEmbeddings,
  embedderInput,
  embeddingScores,
  encodeEmbeddings,
  fuseOrder,
  quantizeEmbedding,
  rankIndices,
} from "./cardEmbed";

const solid = (w: number, h: number, rgb: [number, number, number]) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i += 1) data.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
  return { width: w, height: h, data };
};

describe("embedderInput", () => {
  it("lays out channels as planes in R,G,B order with ImageNet normalisation (#701)", () => {
    const t = embedderInput(solid(EMBED_W, EMBED_H, [200, 100, 50]));
    const plane = EMBED_W * EMBED_H;
    expect(t).toHaveLength(3 * plane);
    expect(t[0]).toBeCloseTo((200 / 255 - 0.485) / 0.229, 4);
    expect(t[plane]).toBeCloseTo((100 / 255 - 0.456) / 0.224, 4);
    expect(t[2 * plane]).toBeCloseTo((50 / 255 - 0.406) / 0.225, 4);
  });

  it("averages the source box under each output pixel instead of sampling one (#701)", () => {
    // Alternating black/white columns at twice the network width: any single
    // sample reads 0 or 1, the area average reads 0.5.
    const w = EMBED_W * 2;
    const h = EMBED_H * 2;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) data.set(x % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255], (y * w + x) * 4);
    }
    const t = embedderInput({ width: w, height: h, data });
    expect(t[123]).toBeCloseTo((0.5 - 0.485) / 0.229, 2);
  });

  it("weights partial coverage when the scale is not an integer (#701)", () => {
    // 1.5x: the left source column is black, the other two white; output pixel 0
    // covers 1 black + 0.5 white column widths.
    const w = Math.round(EMBED_W * 1.5);
    const h = EMBED_H;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) data.set(x % 3 === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255], (y * w + x) * 4);
    }
    const t = embedderInput({ width: w, height: h, data });
    // output x=0 covers source [0,1.5): black for 1, white for 0.5.
    expect(t[0]).toBeCloseTo((1 / 3 - 0.485) / 0.229, 2);
  });

  it("weights partial coverage vertically too (#701)", () => {
    const w = EMBED_W;
    const h = Math.round(EMBED_H * 1.5);
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) data.set(y % 3 === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255], (y * w + x) * 4);
    }
    const t = embedderInput({ width: w, height: h, data });
    expect(t[0]).toBeCloseTo((1 / 3 - 0.485) / 0.229, 2);
  });
});

describe("embeddingScores", () => {
  const unit = (v: number[]) => {
    const n = Math.hypot(...v);
    return v.map((x) => x / n);
  };
  // Dense like a real embedding (no component near 1), so int8 does not clip.
  const A = unit([1, 1, 1, 1, 0, 0, 0, 0]);
  const B = unit([0, 0, 0, 0, 1, 1, 1, 1]);
  const AB = unit([1, 1, 1, 1, 1, 1, 1, 1]);
  const NEG = A.map((x) => -x);

  it("is the cosine of the unit query with each int8 row (#701)", () => {
    const s = embeddingScores(A, [quantizeEmbedding(A), quantizeEmbedding(AB), quantizeEmbedding(B), quantizeEmbedding(NEG)]);
    expect(s[0]).toBeCloseTo(1, 1);
    expect(s[1]).toBeCloseTo(Math.SQRT1_2, 1);
    expect(s[2]).toBeCloseTo(0, 1);
    expect(s[3]).toBeCloseTo(-1, 1);
  });

  it("scores a missing or wrong-sized row below every real one (#701)", () => {
    const s = embeddingScores(A, [null, quantizeEmbedding(NEG), new Int8Array(5), undefined]);
    expect(s[1]).toBeCloseTo(-1, 1);
    expect([s[0], s[2], s[3]]).toEqual([-1, -1, -1]);
  });

  it("quantises with a fixed scale and clamps to int8 (#701)", () => {
    expect(Array.from(quantizeEmbedding([0.1, -0.1, 0.9, -0.9]))).toEqual([
      Math.round(0.1 * EMBED_SCALE),
      -Math.round(0.1 * EMBED_SCALE),
      127,
      -127,
    ]);
  });
});

describe("fuseOrder", () => {
  const n = 10;
  const hashOrder = Array.from({ length: n }, (_, i) => i);

  it("is a permutation: nothing is dropped (#701)", () => {
    const scores = Array.from({ length: n }, (_, i) => Math.sin(i));
    expect([...fuseOrder(hashOrder, scores)].sort((a, b) => a - b)).toEqual(hashOrder);
  });

  it("surfaces a candidate the embedding loves even when the hash puts it last (#701)", () => {
    const scores = Array.from({ length: n }, (_, i) => (i === 9 ? 0.9 : 0.1 - i * 0.001));
    const order = fuseOrder(hashOrder, scores);
    expect(order.indexOf(9)).toBeLessThanOrEqual(3);
  });

  it("keeps a hash favourite near the top when the embedding does not know it (#701)", () => {
    const scores = Array.from({ length: n }, (_, i) => (i === 0 ? -1 : 0.5 - i * 0.01));
    const order = fuseOrder(hashOrder, scores);
    expect(order.indexOf(0)).toBeLessThanOrEqual(3);
  });

  it("falls back to the hash order when no candidate has an embedding (#701)", () => {
    expect(fuseOrder(hashOrder, new Array(n).fill(-1))).toEqual(hashOrder);
  });

  it("orders by descending score, ties by index (#701)", () => {
    expect(rankIndices([0.1, 0.9, 0.9, 0.5])).toEqual([1, 2, 3, 0]);
  });
});

describe("embeddings file", () => {
  it("round-trips labels and rows in order (#701)", () => {
    const labels = ["OP01-001__111", "ST02-003__2", "P-042__99999"];
    const rows = labels.map((_, i) => Int8Array.from([i, -i, 5, 100 - i]));
    const bytes = encodeEmbeddings(labels, rows, 4);
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const { dim, byLabel } = decodeEmbeddings(buf);
    expect(dim).toBe(4);
    labels.forEach((l, i) => expect(Array.from(byLabel.get(l)!)).toEqual(Array.from(rows[i])));
  });
});
