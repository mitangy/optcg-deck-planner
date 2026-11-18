
export const EMBED_W = 160;
export const EMBED_H = 224;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

export const EMBED_SCALE = 200;

export const FUSE_K = 10;

export type PixelData = {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
};

export function embedderInput(image: PixelData): Float32Array {
  const { width: sw, height: sh, data } = image;
  const plane = EMBED_W * EMBED_H;
  const out = new Float32Array(3 * plane);
  const xs = EMBED_W / sw;
  const ys = EMBED_H / sh;
  for (let y = 0; y < EMBED_H; y += 1) {
    const sy0 = y / ys;
    const sy1 = (y + 1) / ys;
    for (let x = 0; x < EMBED_W; x += 1) {
      const sx0 = x / xs;
      const sx1 = (x + 1) / xs;
      let r = 0;
      let g = 0;
      let b = 0;
      let wsum = 0;
      for (let py = Math.floor(sy0); py < Math.min(sh, Math.ceil(sy1)); py += 1) {
        const wy = Math.min(py + 1, sy1) - Math.max(py, sy0);
        for (let px = Math.floor(sx0); px < Math.min(sw, Math.ceil(sx1)); px += 1) {
          const w = wy * (Math.min(px + 1, sx1) - Math.max(px, sx0));
          const i = (py * sw + px) * 4;
          r += data[i] * w;
          g += data[i + 1] * w;
          b += data[i + 2] * w;
          wsum += w;
        }
      }
      const o = y * EMBED_W + x;
      const k = wsum ? 1 / (255 * wsum) : 0;
      out[o] = (r * k - MEAN[0]) / STD[0];
      out[plane + o] = (g * k - MEAN[1]) / STD[1];
      out[2 * plane + o] = (b * k - MEAN[2]) / STD[2];
    }
  }
  return out;
}

export function quantizeEmbedding(v: ArrayLike<number>): Int8Array {
  const out = new Int8Array(v.length);
  for (let i = 0; i < v.length; i += 1) {
    out[i] = Math.max(-127, Math.min(127, Math.round(v[i] * EMBED_SCALE)));
  }
  return out;
}

export function embeddingScores(query: ArrayLike<number>, rows: ReadonlyArray<Int8Array | null | undefined>): Float32Array {
  const out = new Float32Array(rows.length);
  const n = query.length;
  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r];
    if (!row || row.length !== n) {
      out[r] = -1;
      continue;
    }
    let dot = 0;
    for (let i = 0; i < n; i += 1) dot += query[i] * row[i];
    out[r] = dot / EMBED_SCALE;
  }
  return out;
}

export function rankIndices(scores: ArrayLike<number>): number[] {
  return Array.from({ length: scores.length }, (_, i) => i).sort((a, b) => scores[b] - scores[a] || a - b);
}

/**
 * Merge the hash order and the embedding order into one walk order by
 * reciprocal-rank fusion: a candidate near the top of EITHER list surfaces
 * early. Measured on real photos the two fail on different cards (the hash on
 * a gold-foil alt art, the embedding on a washed-out sleeve), so neither
 * alone is as good as the union.
 *
 * The result is a permutation of all candidates: nothing is dropped.
 * `hashOrder` is indices into `scores` in hash order.
 */
export function fuseOrder(hashOrder: readonly number[], scores: ArrayLike<number>, k = FUSE_K): number[] {
  const embRank = new Array<number>(scores.length);
  rankIndices(scores).forEach((idx, rank) => {
    embRank[idx] = rank;
  });
  return hashOrder
    .map((idx, hashRank) => ({ idx, hashRank, s: 1 / (k + hashRank) + 1 / (k + embRank[idx]) }))
    .sort((a, b) => b.s - a.s || a.hashRank - b.hashRank)
    .map((x) => x.idx);
}

type OrtSession = {
  inputNames: readonly string[];
  outputNames: readonly string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array | number[] }>>;
  release?(): Promise<void>;
};
export type OrtLike = {
  InferenceSession: { create(model: Uint8Array, options?: unknown): Promise<OrtSession> };
  Tensor: new (type: "float32", data: Float32Array, dims: number[]) => unknown;
};

export type Embedder = {
  embed(image: PixelData): Promise<Float32Array>;
  release(): Promise<void>;
};

let active: Embedder | null = null;

export function getScanEmbedder(): Embedder | null {
  return active;
}

export function setScanEmbedder(e: Embedder | null): void {
  active = e;
}

async function loadBrowserOrt(): Promise<OrtLike> {
  const ort = await import("onnxruntime-web/wasm");
  const wasm = (await import("onnxruntime-web/ort-wasm-simd-threaded.wasm?url")).default;
  ort.env.wasm.wasmPaths = { wasm } as never;
  ort.env.wasm.numThreads = typeof crossOriginIsolated !== "undefined" && crossOriginIsolated ? 4 : 1;
  return ort as unknown as OrtLike;
}

export async function createEmbedder(model: Uint8Array, ort?: OrtLike): Promise<Embedder> {
  const rt = ort ?? (await loadBrowserOrt());
  const s = await rt.InferenceSession.create(model, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
  return {
    async embed(image) {
      const input = new rt.Tensor("float32", embedderInput(image), [1, 3, EMBED_H, EMBED_W]);
      const res = await s.run({ [s.inputNames[0]]: input });
      const raw = res[s.outputNames[0]].data;
      let norm = 0;
      for (let i = 0; i < raw.length; i += 1) norm += raw[i] * raw[i];
      const k = norm > 0 ? 1 / Math.sqrt(norm) : 0;
      return Float32Array.from(raw, (v) => v * k);
    },
    release: async () => s.release?.(),
  };
}

export function encodeEmbeddings(labels: string[], rows: Int8Array[], dim: number): Uint8Array {
  const enc = new TextEncoder();
  const encoded = labels.map((l) => enc.encode(l));
  const head = 6 + encoded.reduce((s, b) => s + 2 + b.length, 0);
  const out = new Uint8Array(head + labels.length * dim);
  const view = new DataView(out.buffer);
  view.setUint32(0, labels.length, true);
  view.setUint16(4, dim, true);
  let o = 6;
  for (const b of encoded) {
    view.setUint16(o, b.length, true);
    out.set(b, o + 2);
    o += 2 + b.length;
  }
  rows.forEach((r, i) => out.set(new Uint8Array(r.buffer, r.byteOffset, dim), head + i * dim));
  return out;
}

export function decodeEmbeddings(buf: ArrayBuffer): { dim: number; byLabel: Map<string, Int8Array> } {
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  const count = view.getUint32(0, true);
  const dim = view.getUint16(4, true);
  const dec = new TextDecoder();
  const labels: string[] = [];
  let o = 6;
  for (let i = 0; i < count; i += 1) {
    const len = view.getUint16(o, true);
    labels.push(dec.decode(bytes.subarray(o + 2, o + 2 + len)));
    o += 2 + len;
  }
  const byLabel = new Map<string, Int8Array>();
  labels.forEach((l, i) => byLabel.set(l, new Int8Array(buf, o + i * dim, dim)));
  return { dim, byLabel };
}
