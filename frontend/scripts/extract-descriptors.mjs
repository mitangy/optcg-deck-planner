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
import cvModule from "@techstark/opencv-js";

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

/** One record: label, dimensions, keypoints (uint16 pairs), descriptors (32B each). */
function encodeRecord(label, width, height, kp, desc) {
  const labelBytes = new TextEncoder().encode(label);
  const n = kp.length / 2;
  const size = 2 + labelBytes.length + 2 + 2 + 2 + n * 4 + n * 32;
  const buf = new Uint8Array(size);
  const view = new DataView(buf.buffer);
  let o = 0;
  view.setUint16(o, labelBytes.length, true); o += 2;
  buf.set(labelBytes, o); o += labelBytes.length;
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
    const rec = encodeRecord(entry.label, raw.width, raw.height, kp, new Uint8Array(desc.data));
    records.push(rec);
    meta.push({ label: entry.label, cardId: entry.card_id, offset, length: rec.length });
    offset += rec.length;

    mat.delete(); gray.delete(); kpVec.delete(); desc.delete(); mask.delete(); orb.delete();
    done += 1;
    if (done % 50 === 0) console.log(`  ${done}/${index.length}`);
  }

  // Split into chunks, restating each record's offset relative to its own
  // chunk so a client can use a chunk without holding the others.
  //
  // Chunks are content-addressed: the filename *is* the hash of the bytes.
  // The catalog syncs nightly, so a single global version would invalidate
  // every cached chunk whenever one card was added, forcing a full
  // re-download for a handful of new cards. With content addressing an
  // unchanged chunk keeps its name, the client already has it, and only
  // genuinely new or changed chunks are fetched. It also makes the files
  // safely immutable for CDN caching.
  const chunks = [];
  let total = 0;
  for (let start = 0; start < records.length; start += CHUNK_RECORDS) {
    const slice = records.slice(start, start + CHUNK_RECORDS);
    const size = slice.reduce((s, r) => s + r.length, 0);
    const buf = new Uint8Array(size);
    const entries = [];
    let p = 0;
    slice.forEach((r, i) => {
      const m = meta[start + i];
      entries.push({ label: m.label, cardId: m.cardId, offset: p, length: r.length });
      buf.set(r, p);
      p += r.length;
    });
    const hash = createHash("sha256").update(buf).digest("hex").slice(0, 16);
    const file = `descriptors-${hash}.bin`;
    writeFileSync(join(outDir, file), buf);
    chunks.push({ file, hash, bytes: size, records: entries });
    total += size;
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
