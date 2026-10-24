/** Browser timing for the learned detector (dev tool, #701).
 *
 * Served by `npm run dev`; driven by `bench.mjs` (Playwright). Loads the model
 * through the real browser path (`loadCardDetector` with no ORT passed, so the
 * dynamic onnxruntime-web import and its WASM asset resolve exactly as in the app),
 * then times `detectWithModel` on each photo.
 */
import { detectWithModel, loadCardDetector } from "../../src/cardDetectModel";

const params = new URLSearchParams(location.search);
const photos = (params.get("photos") ?? "").split(",").filter(Boolean);
const model = params.get("model") ?? "/scan-data/card-detector.onnx";

async function photoData(url: string): Promise<ImageData> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height);
}

async function main() {
  const out: Record<string, unknown> = { crossOriginIsolated, cores: navigator.hardwareConcurrency };
  const bytes = new Uint8Array(await (await fetch(model)).arrayBuffer());
  let t = performance.now();
  out.loaded = await loadCardDetector(bytes);
  out.loadMs = Math.round(performance.now() - t);
  const runs: Record<string, unknown>[] = [];
  for (const p of photos) {
    const img = await photoData(p);
    const times: number[] = [];
    let n = 0;
    let quads: unknown = null;
    for (let i = 0; i < 3; i += 1) {
      t = performance.now();
      const cards = await detectWithModel(img);
      times.push(Math.round(performance.now() - t));
      n = cards?.length ?? -1;
      quads = cards?.map((c) => c.quad);
    }
    runs.push({ photo: p, size: `${img.width}x${img.height}`, cards: n, ms: times, quads });
  }
  out.runs = runs;
  (window as unknown as { __bench: unknown }).__bench = out;
  document.getElementById("out")!.textContent = JSON.stringify(out, null, 1);
}
main().catch((e) => {
  (window as unknown as { __bench: unknown }).__bench = { error: String(e?.stack ?? e) };
  document.getElementById("out")!.textContent = String(e?.stack ?? e);
});
