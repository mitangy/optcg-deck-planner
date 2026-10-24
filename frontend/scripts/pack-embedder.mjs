#!/usr/bin/env node
/** Embed every reference printing with the trained model and write the bundle (#701).
 *
 *   npx tsx scripts/pack-embedder.mjs <refsDir> <model.onnx> <outDir>
 *
 * Writes into <outDir> (next to the descriptor chunks):
 *   card-embedder-<hash>.onnx   the model, content-addressed
 *   embeddings-<hash>.bin       int8 embedding per printing (cardEmbed.encodeEmbeddings)
 *   card-embedder.json          pointer the client downloads first
 *
 * Reference preprocessing is `embedderInput` from src/cardEmbed.ts, the same
 * function the browser runs on the query, so the two sides cannot drift. The
 * model is trained by scripts/train-embedder and is not committed.
 */
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import jpeg from "jpeg-js";
import * as ort from "onnxruntime-web";
import { EMBED_H, EMBED_W, embedderInput, encodeEmbeddings, quantizeEmbedding } from "../src/cardEmbed.ts";

const [refsDir, modelPath, outDir] = process.argv.slice(2);
if (!refsDir || !modelPath || !outDir) {
  console.error("usage: pack-embedder.mjs <refsDir> <model.onnx> <outDir>");
  process.exit(1);
}
const FORMAT = "embed-v1";
const modelBytes = readFileSync(modelPath);
ort.env.wasm.numThreads = 1;
const session = await ort.InferenceSession.create(new Uint8Array(modelBytes), { executionProviders: ["wasm"] });
const index = JSON.parse(readFileSync(join(refsDir, "index.json"), "utf8"));

const labels = [];
const rows = [];
let dim = 0;
for (const entry of index) {
  let img;
  try {
    img = jpeg.decode(readFileSync(join(refsDir, entry.file)), { useTArray: true });
  } catch (err) {
    console.warn(`  skip ${entry.file}: ${err.message}`);
    continue;
  }
  const input = new ort.Tensor("float32", embedderInput(img), [1, 3, EMBED_H, EMBED_W]);
  const out = (await session.run({ [session.inputNames[0]]: input }))[session.outputNames[0]].data;
  let n = 0;
  for (const v of out) n += v * v;
  const unit = Float32Array.from(out, (v) => v / Math.sqrt(n));
  dim = unit.length;
  labels.push(entry.label);
  rows.push(quantizeEmbedding(unit));
  if (labels.length % 500 === 0) console.log(`  ${labels.length}/${index.length}`);
}

const embBytes = encodeEmbeddings(labels, rows, dim);
const hash = (b) => createHash("sha256").update(b).digest("hex").slice(0, 16);
const modelFile = `card-embedder-${hash(modelBytes)}.onnx`;
const embFile = `embeddings-${hash(embBytes)}.bin`;
mkdirSync(outDir, { recursive: true });
copyFileSync(modelPath, join(outDir, modelFile));
writeFileSync(join(outDir, embFile), embBytes);
const pointer = {
  formatVersion: FORMAT,
  model: { file: modelFile, hash: hash(modelBytes), bytes: statSync(modelPath).size },
  embeddings: { file: embFile, hash: hash(embBytes), bytes: embBytes.length, count: labels.length, dim },
};
writeFileSync(join(outDir, "card-embedder.json"), JSON.stringify(pointer) + "\n");

// Drop superseded files so regenerating does not grow the directory.
let pruned = 0;
for (const f of readdirSync(outDir)) {
  const stale =
    (f.startsWith("card-embedder-") && f.endsWith(".onnx") && f !== modelFile) ||
    (f.startsWith("embeddings-") && f.endsWith(".bin") && f !== embFile);
  if (stale) {
    unlinkSync(join(outDir, f));
    pruned += 1;
  }
}
console.log(
  `${labels.length} embeddings x ${dim} -> ${embFile} (${(embBytes.length / 1048576).toFixed(2)} MB), ` +
    `${modelFile} (${(modelBytes.length / 1048576).toFixed(2)} MB)${pruned ? `, pruned ${pruned}` : ""}`,
);
process.exit(0);
