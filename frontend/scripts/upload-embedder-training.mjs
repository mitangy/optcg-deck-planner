#!/usr/bin/env node
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
