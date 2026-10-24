#!/usr/bin/env node
/** Identification accuracy on real phone photos with hand-labelled card quads.
 *
 * Isolates *identification* from detection: each labelled quad (the printed
 * card edge, from .scan-build/real-photos/quads.json) is rectified and handed
 * to matchRectified against the full descriptor bundle. Photos and quads are
 * the owner's and gitignored.
 *
 *   cd frontend
 *   DESC=.scan-build/full-desc npx tsx scripts/real-photo-eval.mjs
 *   PHOTOS=photo3,photo4 JITTER=1 ... (optional: jitter quads 1.5% to mimic a detector)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import jpeg from "jpeg-js";
import { decodeRecord } from "../src/descriptorCache.ts";
import { buildCandidates } from "../src/cardScanMatch.ts";
import { rectifyToImageData } from "../src/cardRectify.ts";
import { getCv } from "../src/cardMatch.ts";
import { loadMatchAssets, matchRectified } from "./eval-shared.mjs";
import { classifyMatch } from "../src/cardScanMulti.ts";

const DESC = process.env.DESC || ".scan-build/full-desc";
const DIR = ".scan-build/real-photos";
const only = process.env.PHOTOS ? process.env.PHOTOS.split(",") : null;
const OUT = process.env.OUT;

await getCv();
const cands = await loadMatchAssets(DESC);
const truth = JSON.parse(readFileSync(join(DIR, "truth.json"), "utf8"));
const quads = JSON.parse(readFileSync(join(DIR, "quads.json"), "utf8"));
const rows = [];
for (const [photo, items] of Object.entries(quads)) {
  if (only && !only.some((o) => photo.startsWith(o))) continue;
  const raw = jpeg.decode(readFileSync(join(DIR, photo)), { useTArray: true, maxMemoryUsageInMB: 2048 });
  const img = { width: raw.width, height: raw.height, data: new Uint8ClampedArray(raw.data) };
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    const px = rectifyToImageData(img, it.quad);
    const t0 = performance.now();
    const m = await matchRectified(px, cands);
    const ms = performance.now() - t0;
    const ok = !!m && (it.accept ?? [it.id]).includes(m.cardId);
    const strict = !!m && m.cardId === it.id;
    const conf = classifyMatch(m);
    rows.push({ photo, i, truth: it.id, got: m?.cardId ?? null, ok, strict, conf, inliers: m?.inliers ?? 0, runnerUp: m?.runnerUp ?? 0, examined: m?.examined ?? 0, ms: Math.round(ms), });
    const r = rows[rows.length - 1];
    console.log(`${photo.slice(0, 6)} #${i} ${it.id.padEnd(9)} -> ${String(r.got).padEnd(9)} ${ok ? "OK " : "BAD"} inl=${r.inliers} ru=${r.runnerUp} ex=${r.examined} er=${m?.embedRank ?? "-"} ${r.ms}ms ${r.conf ?? ""}`);
  }
}
const n = rows.length;
const ok = rows.filter((r) => r.ok).length;
const sureWrong = rows.filter((r) => !r.ok && r.conf === "sure").length;
const strict = rows.filter((r) => r.strict).length;
const sure = rows.filter((r) => r.conf === "sure").length;
const check = rows.filter((r) => r.conf === "check").length;
const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
console.log(`\ncorrect ${ok}/${n} (strict id ${strict}/${n})  sure ${sure} check ${check} none ${n - sure - check}  sure-but-wrong ${sureWrong}  median ${ms[n >> 1]}ms  worst ${ms[n - 1]}ms  total ${ms.reduce((a, b) => a + b, 0)}ms`);
if (OUT) writeFileSync(OUT, JSON.stringify(rows, null, 1));
process.exit(0);
