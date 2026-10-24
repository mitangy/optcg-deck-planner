#!/usr/bin/env node
/** Upload a descriptor bundle to Vercel Blob.
 *
 * Descriptors are a build artifact, not source: ~55 MB regenerated whenever
 * a set releases. Committing them would grow the repo permanently, and
 * generating them during a deploy is impossible (it needs ~6,400 image
 * downloads). Blob storage keeps them out of git while still serving them
 * from a CDN, and lets the bundle be refreshed without redeploying.
 *
 * Chunks are content-addressed, so uploads are idempotent: a chunk whose
 * bytes are unchanged has the same filename and is simply overwritten with
 * identical content. Only the manifest meaningfully changes between runs.
 *
 * A `card-detector.json` + `card-detector-<hash>.onnx` pair in the bundle
 * directory (see pack-detector.mjs) is uploaded too.
 *
 * Requires BLOB_READ_WRITE_TOKEN.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { put } from "@vercel/blob";
import { descriptorChunkFiles } from "../src/descriptorCache.ts";

/** Everything lives under one prefix so a stale bundle can be identified. */
const PREFIX = "scan-data";

/**
 * @vercel/blob requires Node >= 20. On Node 18 it fails deep inside undici
 * with "The stream argument must be an instance of Stream. Received an
 * instance of ReadableStream", which says nothing about the actual cause —
 * so check up front rather than let that surface.
 */
function requireNode20() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major >= 20) return;
  console.error(
    `Node ${process.versions.node} is too old — @vercel/blob needs >= 20.\n` +
      `Run this with a newer Node, e.g.:\n` +
      `  nvm use 20   (or: npx -y node@20 scripts/upload-descriptors.mjs <bundleDir>)`,
  );
  process.exit(1);
}

async function main() {
  requireNode20();
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: upload-descriptors.mjs <bundleDir>");
    process.exit(1);
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("BLOB_READ_WRITE_TOKEN is required.");
    process.exit(1);
  }

  const manifestName = "descriptors.manifest.json";
  const manifest = JSON.parse(readFileSync(join(dir, manifestName), "utf8"));
  const { files: chunkFiles, missing } = descriptorChunkFiles(manifest, readdirSync(dir));
  if (missing.length) {
    console.error(`manifest lists ${missing.length} chunk(s) that are not present: ${missing.join(", ")}`);
    process.exit(1);
  }

  let uploaded = 0;
  let bytes = 0;
  let base = "";
  // Chunks first: the manifest is the pointer to them, so publishing it last
  // means a client can never read a manifest referencing chunks that are not
  // there yet.
  for (const file of chunkFiles) {
    const body = readFileSync(join(dir, file));
    const res = await put(`${PREFIX}/${file}`, body, {
      access: "public",
      contentType: "application/octet-stream",
      // Content-addressed: same name always means same bytes.
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 31536000,
    });
    if (!base) base = res.url.slice(0, res.url.lastIndexOf(`/${PREFIX}/`)) + `/${PREFIX}`;
    uploaded += 1;
    bytes += body.length;
    if (uploaded % 10 === 0) console.log(`  ${uploaded}/${chunkFiles.length}`);
  }

  // The card detector model (optional) is published like a chunk: the
  // content-addressed .onnx first, then its pointer. See pack-detector.mjs.
  const pointerPath = join(dir, "card-detector.json");
  if (existsSync(pointerPath)) {
    const pointer = JSON.parse(readFileSync(pointerPath, "utf8"));
    await put(`${PREFIX}/${pointer.file}`, readFileSync(join(dir, pointer.file)), {
      access: "public",
      contentType: "application/octet-stream",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 31536000,
    });
    await put(`${PREFIX}/card-detector.json`, readFileSync(pointerPath), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
    });
    console.log(`uploaded card detector ${pointer.file}`);
  }

  // The art embedder bundle (optional): model + embeddings first, then the pointer.
  const embedderPointerPath = join(dir, "card-embedder.json");
  if (existsSync(embedderPointerPath)) {
    const p = JSON.parse(readFileSync(embedderPointerPath, "utf8"));
    for (const file of [p.model.file, p.embeddings.file]) {
      await put(`${PREFIX}/${file}`, readFileSync(join(dir, file)), {
        access: "public",
        contentType: "application/octet-stream",
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 31536000,
      });
    }
    await put(`${PREFIX}/card-embedder.json`, readFileSync(embedderPointerPath), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
    });
    console.log(`uploaded card embedder ${p.model.file} + ${p.embeddings.file}`);
  }

  const manifestRes = await put(`${PREFIX}/${manifestName}`, readFileSync(join(dir, manifestName)), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    // The manifest must not be cached like the chunks: it is the one file
    // that changes when the bundle does.
    cacheControlMaxAge: 60,
  });

  console.log(`uploaded ${uploaded} chunks (${(bytes / 1048576).toFixed(1)} MB) + manifest`);
  // The store root, without the prefix: the client appends that itself, so
  // both sides cannot drift apart.
  const root = manifestRes.url.replace(`/${PREFIX}/${manifestName}`, "");
  console.log(`\nSet VITE_SCAN_DATA_BASE to:\n  ${root}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
