#!/usr/bin/env node
/** Extract ORB descriptors for reference card images, offline.
 *
 * This is the offline half of scan matching: reference descriptors never
 * change, so they are computed once here and shipped to the client, which
 * then only pays for its own query extraction (~70 ms) plus matching
 * (~1.2 ms per candidate).
 *
 * Note the decoder difference: Node decodes JPEG with `jpeg-js` while the
 * browser uses its own built-in decoder, so descriptors extracted here are
 * *not* byte-identical to browser-extracted ones. That is fine and is not
 * the property that matters — the reference and the phone photo are
 * different images regardless, and ORB matching tolerates far larger
 * differences than a decoder's rounding. What matters is that matching still
 * works, which is what the harness verifies.
 *
 * Output is a single binary bundle plus a JSON index, so the client can
 * fetch and cache it without parsing JSON for megabytes of binary payload.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import jpeg from "jpeg-js";
// Static import here, unlike the browser side which loads OpenCV lazily:
// this script does nothing else, so there is no bundle to keep small.
import cvModule from "@techstark/opencv-js";

// Imported, not reimplemented: the client sorts candidates by comparing its
// own hash to these, so both sides must use the same algorithm. Run via tsx
// so this .mjs can import the TypeScript source directly.
import { computeOrderHash } from "../src/cardOrder.ts";

const N_FEATURES = 250;

async function getCv() {
  const mod = cvModule;
  if (mod instanceof Promise) return mod;
  if (mod.Mat) return mod;
  await new Promise((resolve) => {
    mod.onRuntimeInitialized = () => resolve();
  });
  return mod;
}

/** One record: label, order hash, dimensions, keypoints (uint16 pairs), descriptors (32B each). */
function encodeRecord(label, orderHash, width, height, kp, desc) {
  const labelBytes = new TextEncoder().encode(label);
  const hashBytes = new TextEncoder().encode(orderHash);
  const n = kp.length / 2;
  const size = 2 + labelBytes.length + 2 + hashBytes.length + 2 + 2 + 2 + n * 4 + n * 32;
  const buf = new Uint8Array(size);
  const view = new DataView(buf.buffer);
  let o = 0;
  view.setUint16(o, labelBytes.length, true); o += 2;
  buf.set(labelBytes, o); o += labelBytes.length;
  view.setUint16(o, hashBytes.length, true); o += 2;
  buf.set(hashBytes, o); o += hashBytes.length;
  view.setUint16(o, width, true); o += 2;
  view.setUint16(o, height, true); o += 2;
  view.setUint16(o, n, true); o += 2;
  for (let i = 0; i < n * 2; i += 1) { view.setUint16(o, kp[i], true); o += 2; }
  buf.set(desc, o);
  return buf;
}

/** Records per chunk. A single multi-megabyte response is not resumable and
 *  times out on flaky connections, which is exactly the network this feature
 *  exists for; chunks let the client download incrementally and keep what it
 *  already has. */
const CHUNK_RECORDS = 250;

async function main() {
  const refsDir = process.argv[2];
  const outDir = process.argv[3];
  if (!refsDir || !outDir) {
    console.error("usage: extract-descriptors.mjs <refsDir> <outDir>");
    process.exit(1);
  }
  const cv = await getCv();
  const index = JSON.parse(readFileSync(join(refsDir, "index.json"), "utf8"));

  const records = [];
  const meta = [];
  let offset = 0;
  let done = 0;
  for (const entry of index) {
    let raw;
    try {
      raw = jpeg.decode(readFileSync(join(refsDir, entry.file)), { useTArray: true });
    } catch (err) {
      console.warn(`  skip ${entry.file}: ${err.message}`);
      continue;
    }
    const mat = cv.matFromArray(raw.height, raw.width, cv.CV_8UC4, raw.data);
    const gray = new cv.Mat();
    cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
    const orb = new cv.ORB(N_FEATURES);
    const kpVec = new cv.KeyPointVector();
    const desc = new cv.Mat();
    const mask = new cv.Mat();
    orb.detectAndCompute(gray, mask, kpVec, desc);

    const n = kpVec.size();
    const kp = new Uint16Array(n * 2);
    for (let i = 0; i < n; i += 1) {
      const p = kpVec.get(i).pt;
      kp[i * 2] = Math.max(0, Math.min(65535, Math.round(p.x)));
      kp[i * 2 + 1] = Math.max(0, Math.min(65535, Math.round(p.y)));
    }
    const orderHash = computeOrderHash({ width: raw.width, height: raw.height, data: raw.data });
    const rec = encodeRecord(entry.label, orderHash, raw.width, raw.height, kp, new Uint8Array(desc.data));
    records.push(rec);
    meta.push({ label: entry.label, cardId: entry.card_id, offset, length: rec.length });
    offset += rec.length;

    mat.delete(); gray.delete(); kpVec.delete(); desc.delete(); mask.delete(); orb.delete();
    done += 1;
    if (done % 50 === 0) console.log(`  ${done}/${index.length}`);
  }

  // Group into chunks by *set*, then content-address each chunk.
  //
  // Grouping must key off something stable in the record, not its position:
  // slicing a sorted list into fixed-size chunks means a new set inserting in
  // the middle shifts every later record into a different chunk, changing
  // every hash and forcing a full re-download — measured, it invalidated
  // 100% of chunks. Keyed by set, adding OP12-999 rewrites only the OP12
  // chunk. Content addressing then makes unchanged chunks keep their
  // filenames, so the client refetches just the difference, and the files are
  // safely immutable for CDN caching.
  const bySet = new Map();
  records.forEach((rec, i) => {
    const set = meta[i].cardId.split("-")[0] || "misc";
    if (!bySet.has(set)) bySet.set(set, []);
    bySet.get(set).push({ rec, meta: meta[i] });
  });

  const chunks = [];
  let total = 0;
  for (const set of [...bySet.keys()].sort()) {
    const group = bySet.get(set);
    // Split oversized sets so no single chunk is unwieldy; a change then
    // touches one part rather than the whole set.
    for (let start = 0; start < group.length; start += CHUNK_RECORDS) {
      const slice = group.slice(start, start + CHUNK_RECORDS);
      const size = slice.reduce((s, x) => s + x.rec.length, 0);
      const buf = new Uint8Array(size);
      const entries = [];
      let p = 0;
      for (const { rec, meta: m } of slice) {
        entries.push({ label: m.label, cardId: m.cardId, offset: p, length: rec.length });
        buf.set(rec, p);
        p += rec.length;
      }
      const hash = createHash("sha256").update(buf).digest("hex").slice(0, 16);
      const file = `descriptors-${hash}.bin`;
      writeFileSync(join(outDir, file), buf);
      chunks.push({ file, hash, set, bytes: size, records: entries });
      total += size;
    }
  }

  // formatVersion invalidates everything on a *format* change (different
  // feature count would make descriptors incomparable); content changes are
  // handled per chunk by the hash above.
  const formatVersion = `orb-f${N_FEATURES}-v1`;
  writeFileSync(
    join(outDir, "descriptors.manifest.json"),
    JSON.stringify({
      formatVersion,
      features: N_FEATURES,
      totalRecords: records.length,
      totalBytes: total,
      chunks,
    }),
  );

  // Drop chunk files no longer referenced, so regenerating does not leave the
  // output directory growing without bound.
  const live = new Set(chunks.map((c) => c.file));
  let pruned = 0;
  for (const f of readdirSync(outDir)) {
    if (f.startsWith("descriptors-") && f.endsWith(".bin") && !live.has(f)) {
      unlinkSync(join(outDir, f));
      pruned += 1;
    }
  }

  console.log(
    `wrote ${records.length} records in ${chunks.length} chunks, ` +
      `${(total / 1048576).toFixed(1)} MB -> ${outDir} (${formatVersion}` +
      `${pruned ? `, pruned ${pruned} stale` : ""})`,
  );
}

main();
