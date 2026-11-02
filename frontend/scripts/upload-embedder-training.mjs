#!/usr/bin/env node
/** Publish retrained embedder weights to blob storage under scan-data/training/ (#852).
 *
 *   BLOB_READ_WRITE_TOKEN=... node scripts/upload-embedder-training.mjs <model.onnx> <checkpoint.pt>
 *
 * Uploads model weights only (never crops). Prints the public ONNX URL on the
 * last line (`onnx_url=...`) and overwrites `card-embedder-latest.pt`.
 *
 *   BLOB_READ_WRITE_TOKEN=... node scripts/upload-embedder-training.mjs --wip <checkpoint.pt>
 *
 * Saves this run's checkpoint as `card-embedder-wip.pt` whether or not it was
 * published. The next run fine-tunes from it, so training builds up week to
 * week even before a model first beats the shipped one (the shipped model has
 * no published checkpoint to start from).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { put } from "@vercel/blob";

const opts = { access: "public", contentType: "application/octet-stream", addRandomSuffix: false, allowOverwrite: true };
if (process.argv[2] === "--wip") {
  const pt = process.argv[3];
  if (!pt || !process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("usage: BLOB_READ_WRITE_TOKEN=... upload-embedder-training.mjs --wip <checkpoint.pt>");
    process.exit(1);
  }
  await put("scan-data/training/card-embedder-wip.pt", readFileSync(pt), { ...opts, cacheControlMaxAge: 60 });
  console.log("saved card-embedder-wip.pt");
  process.exit(0);
}
const [onnxPath, ptPath] = process.argv.slice(2);
if (!onnxPath || !ptPath || !process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("usage: BLOB_READ_WRITE_TOKEN=... upload-embedder-training.mjs <model.onnx> <checkpoint.pt>");
  process.exit(1);
}
const onnx = readFileSync(onnxPath);
const hash = createHash("sha256").update(onnx).digest("hex").slice(0, 16);
const o = await put(`scan-data/training/card-embedder-${hash}.onnx`, onnx, { ...opts, cacheControlMaxAge: 31536000 });
await put("scan-data/training/card-embedder-latest.pt", readFileSync(ptPath), { ...opts, cacheControlMaxAge: 60 });
console.log(`onnx_url=${o.url}`);
