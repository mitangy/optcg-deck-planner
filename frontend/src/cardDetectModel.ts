/** Learned card detector: runs the YOLO11n-pose ONNX model (#701).
 *
 * The model outputs one detection per visible card FACE with four corner
 * keypoints (the printed card's own corners, never the sleeve, toploader,
 * slab or acrylic case around it). Training and the generator live in
 * `scripts/train-detector/`.
 *
 * This file is the glue: letterbox the photo, run onnxruntime-web, decode the
 * raw tensor, suppress duplicates, and hand `cardDetect.ts` quads in source
 * pixels. The model file is NOT in the bundle; it is downloaded with the scan
 * descriptors (see `descriptorCache.ts`), and until it is present
 * `detectCardsAsync` quietly uses the OpenCV detector instead.
 *
 * Everything except `loadCardDetector`/`runModel` is pure and unit-tested.
 */
import type { Quad } from "./cardRectify";
import { intersectionArea, isCardShaped, quadIoU, quadSides, setCardModelDetector, sortReadingOrder, uprightQuad } from "./cardDetect";
import type { DetectedCard } from "./cardDetect";
import { quadArea } from "./cardRectify";
import { scanLog } from "./scanLog";

export type ModelOptions = {
  /** Long side of the network input. Smaller is faster; cards need ~40 px. */
  longSide?: number;
  /** Detections scoring below this are dropped. */
  scoreThreshold?: number;
  /** Quads overlapping a better one by more than this IoU are duplicates. */
  nmsIoU?: number;
};

export const MODEL_DEFAULTS = {
  longSide: 640,
  scoreThreshold: 0.25,
  nmsIoU: 0.5,
};

/** Options with every unset (or explicitly undefined) field at its default. */
export function resolveOptions(opts: ModelOptions = {}): Required<ModelOptions> {
  return {
    longSide: opts.longSide ?? MODEL_DEFAULTS.longSide,
    scoreThreshold: opts.scoreThreshold ?? MODEL_DEFAULTS.scoreThreshold,
    nmsIoU: opts.nmsIoU ?? MODEL_DEFAULTS.nmsIoU,
  };
}

/** Network stride; the input's sides must be multiples of it. */
export const STRIDE = 32;
const PAD_VALUE = 114 / 255;

/** Output channels of YOLO-pose with one class and four 3-value keypoints. */
export const CHANNELS = 4 + 1 + 4 * 3;

export type Letterbox = {
  /** Network input size (multiples of STRIDE). */
  width: number;
  height: number;
  /** Source -> network scale (same both axes). */
  scale: number;
  /** Where the scaled photo's top-left sits in the network input. */
  padX: number;
  padY: number;
  /** Size of the scaled photo inside the input. */
  innerWidth: number;
  innerHeight: number;
};

/** Geometry only: how a `srcW x srcH` photo is placed in the network input. */
export function letterboxGeometry(srcW: number, srcH: number, longSide: number): Letterbox {
  const scale = longSide / Math.max(srcW, srcH);
  const innerWidth = Math.max(1, Math.round(srcW * scale));
  const innerHeight = Math.max(1, Math.round(srcH * scale));
  const width = Math.ceil(innerWidth / STRIDE) * STRIDE;
  const height = Math.ceil(innerHeight / STRIDE) * STRIDE;
  return {
    width,
    height,
    scale,
    padX: Math.floor((width - innerWidth) / 2),
    padY: Math.floor((height - innerHeight) / 2),
    innerWidth,
    innerHeight,
  };
}

/**
 * Photo -> NCHW float RGB in [0,1], area-averaged down to the letterbox
 * (a 12 MP photo shrunk 4x with nearest-neighbour would alias thin card edges
 * away), grey padding around it.
 */
export function preprocess(image: ImageData, longSide: number): { tensor: Float32Array; box: Letterbox } {
  const box = letterboxGeometry(image.width, image.height, longSide);
  const { width: W, height: H, padX, padY, innerWidth: iw, innerHeight: ih } = box;
  const plane = W * H;
  const tensor = new Float32Array(3 * plane).fill(PAD_VALUE);
  const src = image.data;
  const sw = image.width;
  const sh = image.height;
  const xScale = sw / iw;
  const yScale = sh / ih;
  // Column bounds once; rows reuse them.
  const x0s = new Int32Array(iw);
  const x1s = new Int32Array(iw);
  for (let x = 0; x < iw; x += 1) {
    x0s[x] = Math.min(sw - 1, Math.floor(x * xScale));
    x1s[x] = Math.max(x0s[x] + 1, Math.min(sw, Math.floor((x + 1) * xScale)));
  }
  for (let y = 0; y < ih; y += 1) {
    const y0 = Math.min(sh - 1, Math.floor(y * yScale));
    const y1 = Math.max(y0 + 1, Math.min(sh, Math.floor((y + 1) * yScale)));
    for (let x = 0; x < iw; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      const x0 = x0s[x];
      const x1 = x1s[x];
      for (let yy = y0; yy < y1; yy += 1) {
        let o = (yy * sw + x0) * 4;
        for (let xx = x0; xx < x1; xx += 1) {
          r += src[o];
          g += src[o + 1];
          b += src[o + 2];
          o += 4;
        }
      }
      const n = (y1 - y0) * (x1 - x0) * 255;
      const at = (y + padY) * W + x + padX;
      tensor[at] = r / n;
      tensor[plane + at] = g / n;
      tensor[2 * plane + at] = b / n;
    }
  }
  return { tensor, box };
}

export type RawDetection = { quad: Quad; score: number };

/**
 * Decode the raw `[1, 17, N]` output (channel-major: cx, cy, w, h, score, then
 * x, y, visibility per corner) into quads in SOURCE pixels, keeping those
 * above the score threshold. Corner order is the card's own printed order
 * (TL, TR, BR, BL), exactly as trained.
 */
export function decodeDetections(
  data: ArrayLike<number>,
  anchors: number,
  box: Letterbox,
  scoreThreshold: number,
): RawDetection[] {
  const out: RawDetection[] = [];
  for (let i = 0; i < anchors; i += 1) {
    const score = data[4 * anchors + i];
    if (score < scoreThreshold) continue;
    const quad = [0, 1, 2, 3].map((k) => ({
      x: (data[(5 + 3 * k) * anchors + i] - box.padX) / box.scale,
      y: (data[(6 + 3 * k) * anchors + i] - box.padY) / box.scale,
    })) as Quad;
    out.push({ quad, score });
  }
  return out;
}

/** Share of a quad that must lie inside the photo (the model labels cards that are at least 55% in frame). */
const MIN_INSIDE_FRAME = 0.4;

/** Corners that cannot be a card: collapsed, bow-tied or the wrong shape. */
export function isPlausibleCard(q: Quad, imageW: number, imageH: number): boolean {
  if (quadArea(q) < 100) return false;
  // Convex with a consistent winding: all cross products share a sign.
  let sign = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = q[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross === 0) return false;
    const s = Math.sign(cross);
    if (sign && s !== sign) return false;
    sign = s;
  }
  // A card cut by the photo's edge keeps its full quad (corners outside the
  // photo are fine, #789); one with only a sliver inside is a hallucination.
  const frame: Quad = [
    { x: 0, y: 0 },
    { x: imageW, y: 0 },
    { x: imageW, y: imageH },
    { x: 0, y: imageH },
  ];
  if (intersectionArea(q, frame) < MIN_INSIDE_FRAME * quadArea(q)) return false;
  return isCardShaped(q, 0.3);
}

/**
 * Greedy non-maximum suppression on quads: highest score first; a quad is a
 * duplicate of a kept one if their IoU is high, or if it is mostly inside it
 * (a card's inner art box next to its outline).
 */
export function suppressDuplicates(dets: RawDetection[], iou: number): RawDetection[] {
  const sorted = [...dets].sort((a, b) => b.score - a.score);
  const kept: RawDetection[] = [];
  for (const d of sorted) {
    const dup = kept.some((k) => {
      const overlap = quadIoU(k.quad, d.quad);
      return overlap > iou || containment(k.quad, d.quad, overlap) > NESTED;
    });
    if (!dup) kept.push(d);
  }
  return kept;
}

/** Share of the smaller quad that must lie inside a better one to be dropped as nested. */
const NESTED = 0.85;

/** Share of the smaller quad's area that lies inside the other, from their IoU. */
function containment(a: Quad, b: Quad, iou: number): number {
  const aa = quadArea(a);
  const ab = quadArea(b);
  // IoU = I / (aa + ab - I)  =>  I = IoU * (aa + ab) / (1 + IoU)
  const inter = (iou * (aa + ab)) / (1 + iou);
  return inter / Math.min(aa, ab);
}

/**
 * Raw model output -> the detector's result: plausible cards only, duplicates
 * removed, reading order, each quad with its long side running top to bottom.
 */
export function detectionsToCards(
  data: ArrayLike<number>,
  anchors: number,
  box: Letterbox,
  imageW: number,
  imageH: number,
  opts: ModelOptions = {},
): DetectedCard[] {
  const o = resolveOptions(opts);
  const decoded = decodeDetections(data, anchors, box, o.scoreThreshold).filter((d) =>
    isPlausibleCard(d.quad, imageW, imageH),
  );
  const kept = suppressDuplicates(decoded, o.nmsIoU);
  // The model keeps each card's printed orientation (a sideways card comes out
  // rotated); `uprightQuad` only repairs a 90-degree mix-up in the output.
  const quads = kept.map((d) => {
    const [across, down] = quadSides(d.quad);
    return across > down ? uprightQuad(d.quad) : d.quad;
  });
  return sortReadingOrder(quads).map((quad) => ({ quad }));
}

// ------------------------------------------------------------- the session

/** The slice of onnxruntime-web this file uses, so Node scripts can pass their own. */
export type OrtLike = {
  InferenceSession: { create(model: Uint8Array, options?: unknown): Promise<OrtSession> };
  Tensor: new (type: "float32", data: Float32Array, dims: number[]) => unknown;
};
type OrtSession = {
  inputNames: readonly string[];
  outputNames: readonly string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array; dims: readonly number[] }>>;
  release?(): Promise<void>;
};

let session: { ort: OrtLike; s: OrtSession } | null = null;
let loading: Promise<boolean> | null = null;

/** Is a model loaded and registered with `detectCardsAsync`? */
export function cardDetectorReady(): boolean {
  return session !== null;
}

/** Browser: load onnxruntime-web (WASM backend) only when the scanner needs it. */
async function loadBrowserOrt(): Promise<OrtLike> {
  const ort = await import("onnxruntime-web/wasm");
  const wasm = (await import("onnxruntime-web/ort-wasm-simd-threaded.wasm?url")).default;
  ort.env.wasm.wasmPaths = { wasm } as never;
  // Threads need cross-origin isolation, which the app does not set up; ask
  // for one thread rather than have the runtime warn and fall back itself.
  ort.env.wasm.numThreads = typeof crossOriginIsolated !== "undefined" && crossOriginIsolated ? 4 : 1;
  return ort as unknown as OrtLike;
}

/**
 * Create the session from the downloaded model bytes and register the detector.
 * Resolves false (never throws) when the runtime or model cannot be loaded, so
 * the scanner just keeps using the OpenCV detector.
 */
export function loadCardDetector(model: Uint8Array, ort?: OrtLike): Promise<boolean> {
  if (session) return Promise.resolve(true);
  loading ??= (async () => {
    try {
      const rt = ort ?? (await loadBrowserOrt());
      const s = await rt.InferenceSession.create(model, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
      session = { ort: rt, s };
      setCardModelDetector((image) => detectWithModel(image));
      return true;
    } catch (err) {
      scanLog("scan:detector-load-failed", err);
      return false;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export async function releaseCardDetector(): Promise<void> {
  setCardModelDetector(null);
  const cur = session;
  session = null;
  await cur?.s.release?.();
}

/** Run the model on one photo. Null when no model is loaded or inference fails. */
export async function detectWithModel(image: ImageData, opts: ModelOptions = {}): Promise<DetectedCard[] | null> {
  if (!session) return null;
  const { ort, s } = session;
  const o = resolveOptions(opts);
  try {
    const { tensor, box } = preprocess(image, o.longSide);
    const input = new ort.Tensor("float32", tensor, [1, 3, box.height, box.width]);
    const result = await s.run({ [s.inputNames[0]]: input });
    const out = result[s.outputNames[0]];
    const anchors = out.dims[2];
    if (out.dims[1] !== CHANNELS) return null;
    return detectionsToCards(out.data, anchors, box, image.width, image.height, o);
  } catch {
    return null;
  }
}
