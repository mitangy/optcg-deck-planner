#!/usr/bin/env node
/** Time the detector in headless Chromium: starts Vite, opens the bench page (dev tool, #701).
 *
 *   cd frontend
 *   PHOTOS=.scan-build/real-photos MODEL=public/scan-data/card-detector.onnx node scripts/detector-bench/bench.mjs
 *
 * Photos are copied into public/dev-fixtures/ (gitignored) so Vite can serve them.
 */
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { build, createServer, preview } from "vite";
import { chromium } from "@playwright/test";

const dir = process.env.PHOTOS || ".scan-build/real-photos";
const model = process.env.MODEL || "public/scan-data/card-detector.onnx";
mkdirSync("public/dev-fixtures/bench", { recursive: true });
const photos = readdirSync(dir).filter((f) => f.endsWith(".jpg"));
for (const f of photos) copyFileSync(`${dir}/${f}`, `public/dev-fixtures/bench/${f}`);
copyFileSync(model, "public/dev-fixtures/bench/model.onnx");

// PROD=1 benchmarks the production bundle (built with this page as a second entry)
// instead of the dev server, to prove the WASM asset resolves from hashed output.
let server;
if (process.env.PROD) {
  const outDir = "/tmp/detector-bench-dist";
  await build({ logLevel: "error", build: { outDir, emptyOutDir: true, rollupOptions: { input: { main: "index.html", bench: "scripts/detector-bench/index.html" } } } });
  server = await preview({ logLevel: "error", build: { outDir }, preview: { port: 5191 } });
  server.close = () => new Promise((r) => server.httpServer.close(r));
} else {
  server = await createServer({ server: { port: 5191 }, logLevel: "error" });
  await server.listen();
}
const browser = await chromium.launch({ args: process.env.GPU ? [] : ["--disable-gpu"] });
const page = await browser.newPage();
page.on("console", (m) => process.env.VERBOSE && console.log("console:", m.text()));
const q = new URLSearchParams({ model: "/dev-fixtures/bench/model.onnx", photos: photos.map((f) => `/dev-fixtures/bench/${f}`).join(",") });
await page.goto(`http://localhost:5191/scripts/detector-bench/index.html?${q}`);
await page.waitForFunction(() => window.__bench, null, { timeout: 300000 });
const r = await page.evaluate(() => window.__bench);
await browser.close();
await server.close();
if (r.error) { console.error(r.error); process.exit(1); }
console.log(`loaded=${r.loaded} loadMs=${r.loadMs} cores=${r.cores} crossOriginIsolated=${r.crossOriginIsolated}`);
for (const run of r.runs) console.log(`${run.photo.split("/").pop().padEnd(24)} ${run.size.padEnd(10)} cards ${run.cards}  ms ${run.ms.join(", ")}`);
process.exit(0);
