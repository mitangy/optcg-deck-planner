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
 * Requires BLOB_READ_WRITE_TOKEN.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { put } from "@vercel/blob";

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
  const chunkFiles = readdirSync(dir).filter((f) => f.endsWith(".bin"));
  if (chunkFiles.length !== manifest.chunks.length) {
    console.error(
      `manifest lists ${manifest.chunks.length} chunks but ${chunkFiles.length} .bin files are present`,
    );
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
