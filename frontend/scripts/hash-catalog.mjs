#!/usr/bin/env node
/**
 * Compute perceptual hashes for catalog printings whose reference image
 * hasn't been hashed yet (or whose image_url changed since it was), and
 * write them back to the backend.
 *
 * Imports the exact same computeHash() the frontend calls at scan time
 * (../src/imageHash.ts) — deliberately, so a phone-photo hash and a
 * reference-image hash come from one implementation, not two independently
 * maintained ports that could quietly drift apart.
 *
 * Run after the Python TCGCSV sync (see .github/workflows/catalog-sync.yml),
 * or manually via `npm run hash-catalog`.
 */
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { computeHash } from "../src/imageHash.ts";

const API_URL = (process.env.API_URL || "https://optcg-api-nutb.onrender.com").replace(/\/+$/, "");
const TOKEN = process.env.CATALOG_SYNC_TOKEN;

const FETCH_LIMIT_PER_ROUND = 2000;
const IMAGE_FETCH_CONCURRENCY = 6;
const IMAGE_FETCH_TIMEOUT_MS = 20_000;
const WRITE_BATCH_SIZE = 500;
const MAX_ROUNDS = 20;

if (!TOKEN) {
  console.error("CATALOG_SYNC_TOKEN is required (same secret the Python sync uses).");
  process.exit(1);
}

function authHeaders() {
  return { "X-Catalog-Token": TOKEN, Accept: "application/json" };
}

async function fetchTargets() {
  const res = await fetch(`${API_URL}/admin/catalog/printings-needing-hash?limit=${FETCH_LIMIT_PER_ROUND}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`printings-needing-hash failed: HTTP ${res.status}`);
  }
  return res.json();
}

function decodeImage(buffer, contentType) {
  const isPng = (contentType || "").includes("png") || (buffer[0] === 0x89 && buffer[1] === 0x50);
  if (isPng) {
    const png = PNG.sync.read(buffer);
    return { width: png.width, height: png.height, data: png.data };
  }
  const { width, height, data } = jpeg.decode(buffer, { useTArray: true });
  return { width, height, data };
}

async function hashOne(target) {
  let res;
  try {
    res = await fetch(target.image_url, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
  } catch (err) {
    return { ok: false, target, error: `image fetch error: ${err.message}` };
  }
  if (!res.ok) {
    return { ok: false, target, error: `image fetch HTTP ${res.status}` };
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "";
  let pixels;
  try {
    pixels = decodeImage(buffer, contentType);
  } catch (err) {
    return { ok: false, target, error: `decode failed: ${err.message}` };
  }
  return { ok: true, target, phash: computeHash(pixels) };
}

/** Run `fn` over `items` with at most `limit` in flight at once. */
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function writeHashes(hashes) {
  for (let i = 0; i < hashes.length; i += WRITE_BATCH_SIZE) {
    const batch = hashes.slice(i, i + WRITE_BATCH_SIZE);
    const res = await fetch(`${API_URL}/admin/catalog/hashes`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ hashes: batch }),
    });
    if (!res.ok) {
      throw new Error(`writing hashes failed: HTTP ${res.status}`);
    }
    const body = await res.json();
    console.log(`  wrote ${body.updated ?? batch.length} hashes`);
  }
}

async function main() {
  let totalHashed = 0;
  let totalFailed = 0;
  // Each write shrinks the "needing hash" set, so re-fetching it doubles as
  // pagination; stop once a round returns nothing, or hashes nothing (to
  // avoid looping forever on a batch that only ever fails).
  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    const targets = await fetchTargets();
    if (!targets.length) {
      console.log("No printings need hashing.");
      break;
    }
    console.log(`Round ${round}: hashing ${targets.length} printings`);
    const results = await mapWithConcurrency(targets, IMAGE_FETCH_CONCURRENCY, hashOne);

    const hashes = [];
    for (const r of results) {
      if (r.ok) {
        hashes.push({ product_id: r.target.product_id, card_id: r.target.card_id, phash: r.phash });
      } else {
        totalFailed += 1;
        console.warn(`  skip ${r.target.card_id}/${r.target.product_id}: ${r.error}`);
      }
    }
    if (!hashes.length) break;
    await writeHashes(hashes);
    totalHashed += hashes.length;
  }
  console.log(`Done. Hashed ${totalHashed} printings, ${totalFailed} failures.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
