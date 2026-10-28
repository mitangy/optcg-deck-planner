#!/usr/bin/env node
/** Detector (and detector + identification) on the owner's real phone photos (#701).
 *
 * Photos, truth.json and quads.json live in .scan-build/real-photos (gitignored).
 * Detection is scored against the hand-labelled top-card quads by IoU; the full
 * pipeline (`matchAllCardsWith`) against truth.json: a pile counts as found if
 * any detected card's id is in its `ids`.
 *
 *   cd frontend
 *   MODEL=public/scan-data/card-detector.onnx npx tsx scripts/detect-eval.mjs
 *   MODE=classic npx tsx scripts/detect-eval.mjs     # the OpenCV detector alone
 *   IDENTIFY=0 ...                                   # detection numbers only (fast)
 *   SCORE=0.4 NMS=0.6 LONG_SIDE=800 ...              # override the model's decode options
 *   DESC=.scan-build/full-desc  PHOTOS=photo3,photo4  OUT=/tmp/overlays
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import jpeg from "jpeg-js";
import * as ort from "onnxruntime-web";
import { getCv } from "../src/cardMatch.ts";
import { detectCardsAsync, quadIoU, setCardModelDetector } from "../src/cardDetect.ts";
import { loadCardDetector, detectWithModel, releaseCardDetector } from "../src/cardDetectModel.ts";
import { matchAllCardsWith } from "../src/cardScanMulti.ts";
import { loadMatchAssets } from "./eval-shared.mjs";

const DIR = ".scan-build/real-photos";
const MODEL = process.env.MODEL || "public/scan-data/card-detector.onnx";
const MODE = process.env.MODE || "model"; // model | classic
const IDENTIFY = process.env.IDENTIFY !== "0";
const DESC = process.env.DESC || ".scan-build/full-desc";
const OUT = process.env.OUT || ".scan-build/real-detect";
const only = process.env.PHOTOS ? process.env.PHOTOS.split(",") : null;
const LONG = Number(process.env.LONG_SIDE || 0) || undefined;
const SCORE = Number(process.env.SCORE || 0) || undefined;
const NMS = Number(process.env.NMS || 0) || undefined;

function decode(name) {
  const raw = jpeg.decode(readFileSync(join(DIR, name)), { useTArray: true, maxMemoryUsageInMB: 2048 });
  return { width: raw.width, height: raw.height, data: new Uint8ClampedArray(raw.data) };
}

function line(img, a, b, color, t = 3) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
  for (let i = 0; i <= n; i += 1) {
    const x = Math.round(a.x + ((b.x - a.x) * i) / n);
    const y = Math.round(a.y + ((b.y - a.y) * i) / n);
    for (let dy = -t; dy <= t; dy += 1) for (let dx = -t; dx <= t; dx += 1) {
      const px = x + dx, py = y + dy;
      if (px < 0 || py < 0 || px >= img.width || py >= img.height) continue;
      const o = (py * img.width + px) * 4;
      img.data[o] = color[0]; img.data[o + 1] = color[1]; img.data[o + 2] = color[2]; img.data[o + 3] = 255;
    }
  }
}
function drawQuad(img, q, color) {
  for (let i = 0; i < 4; i += 1) line(img, q[i], q[(i + 1) % 4], color);
  for (let dy = -9; dy <= 9; dy += 1) for (let dx = -9; dx <= 9; dx += 1) { // dot on the first corner
    const px = Math.round(q[0].x) + dx, py = Math.round(q[0].y) + dy;
    if (px < 0 || py < 0 || px >= img.width || py >= img.height) continue;
    const o = (py * img.width + px) * 4;
    img.data[o] = color[0]; img.data[o + 1] = color[1]; img.data[o + 2] = color[2];
  }
}

function assign(gt, det) {
  const pairs = [];
  gt.forEach((g, gi) => det.forEach((d, di) => {
    const iou = quadIoU(g.quad, d.quad);
    if (iou >= 0.5) pairs.push({ gi, di, iou });
  }));
  pairs.sort((a, b) => b.iou - a.iou);
  const ug = new Set(), ud = new Set(), out = [];
  for (const p of pairs) {
    if (ug.has(p.gi) || ud.has(p.di)) continue;
    ug.add(p.gi); ud.add(p.di); out.push(p);
  }
  return out;
}

const cv = await getCv();
if (MODE === "model") {
  const ok = await loadCardDetector(new Uint8Array(readFileSync(MODEL)), ort);
  if (!ok) { console.error(`could not load ${MODEL}`); process.exit(1); }
  if (LONG || SCORE || NMS) setCardModelDetector((img) => detectWithModel(img, { longSide: LONG, scoreThreshold: SCORE, nmsIoU: NMS }));
}
if (process.env.SYNTH) {
  // The multi-scan harness's synthetic scenes (run multi-scan-harness.mjs once to write them).
  const dir = ".scan-build/scenes";
  const names = readdirSync(dir).filter((f) => f.endsWith(".gt.json")).map((f) => f.replace(".gt.json", "")).sort();
  let gtN = 0, detN = 0, tp = 0, iouSum = 0, ms = 0;
  for (const name of names) {
    const raw = jpeg.decode(readFileSync(join(dir, `${name}.jpg`)), { useTArray: true });
    const img = { width: raw.width, height: raw.height, data: new Uint8ClampedArray(raw.data) };
    const gt = JSON.parse(readFileSync(join(dir, `${name}.gt.json`), "utf8"));
    const t0 = performance.now();
    const det = (await detectCardsAsync(cv, img, { fallback: false })).map((c) => ({ quad: c.quad }));
    ms += performance.now() - t0;
    const pairs = assign(gt, det);
    gtN += gt.length; detN += det.length; tp += pairs.length; iouSum += pairs.reduce((a, p) => a + p.iou, 0);
    if (pairs.length < gt.length || det.length > gt.length) console.log(`${name.padEnd(22)} gt ${gt.length} det ${det.length} found ${pairs.length}`);
  }
  console.log(`\n${MODE.toUpperCase()} on ${names.length} synthetic scenes: recall ${(tp / gtN * 100).toFixed(1)}% (${tp}/${gtN})  precision ${(tp / detN * 100).toFixed(1)}% (${tp}/${detN})  mean IoU ${(iouSum / tp).toFixed(3)}  ${Math.round(ms / names.length)} ms/scene`);
  process.exit(0);
}
const cands = IDENTIFY ? await loadMatchAssets(DESC) : [];
const truth = JSON.parse(readFileSync(join(DIR, "truth.json"), "utf8"));
const quads = JSON.parse(readFileSync(join(DIR, "quads.json"), "utf8"));
mkdirSync(OUT, { recursive: true });

const tot = { gt: 0, found: 0, fp: 0, iou: 0, piles: 0, pilesFound: 0, idOk: 0, ms: 0, sureWrong: 0 };
for (const [photo, gt] of Object.entries(quads)) {
  if (only && !only.some((o) => photo.startsWith(o))) continue;
  const img = decode(photo);
  const t0 = performance.now();
  const items = IDENTIFY
    ? await matchAllCardsWith({ thumbnail: () => "" }, img, cands)
    : (await detectCardsAsync(cv, img)).map((c) => ({ quad: c.quad, cardId: null }));
  const ms = performance.now() - t0;
  const pairs = assign(gt, items);
  const matchedDet = new Set(pairs.map((p) => p.di));
  const fp = items.length - matchedDet.size;
  const iou = pairs.reduce((s, p) => s + p.iou, 0);
  const piles = truth[photo] || [];
  let pilesFound = 0;
  const spent = new Set(); // a detection accounts for one pile only (two piles can share an id)
  for (const pile of piles) {
    const hit = items.findIndex((d, i) => !spent.has(i) && d.cardId && pile.ids.includes(d.cardId.split("__")[0]));
    if (hit >= 0) { spent.add(hit); pilesFound += 1; }
  }
  let idOk = 0;
  for (const p of pairs) {
    const accepted = (truth[photo] || []).find((t) => t.ids.includes(gt[p.gi].id))?.ids ?? [gt[p.gi].id];
    const got = items[p.di].cardId;
    if (got && accepted.includes(got.split("__")[0])) idOk += 1;
  }
  console.log(
    `${photo.padEnd(24)} gt ${String(gt.length).padStart(2)}  det ${String(items.length).padStart(2)}  found ${pairs.length}/${gt.length}  ` +
    `fp ${fp}  meanIoU ${(pairs.length ? iou / pairs.length : 0).toFixed(2)}` +
    (IDENTIFY ? `  piles ${pilesFound}/${piles.length}  idOk ${idOk}/${pairs.length}` : "") + `  ${Math.round(ms)}ms`,
  );
  if (IDENTIFY) {
    // Sure-but-wrong on labelled cards, and what the unlabelled extra detections were read as.
    for (const p of pairs) {
      const accepted = (truth[photo] || []).find((t) => t.ids.includes(gt[p.gi].id))?.ids ?? [gt[p.gi].id];
      const it = items[p.di];
      if (!(it.cardId && accepted.includes(it.cardId.split("__")[0])) && it.confidence !== "sure") console.log(`    not identified: ${gt[p.gi].id} read as ${it.cardId ?? "-"} (${it.confidence}, ${it.inliers} inliers)`);
      if (it.confidence === "sure" && !(it.cardId && accepted.includes(it.cardId.split("__")[0]))) { tot.sureWrong += 1; console.log(`    SURE-BUT-WRONG: ${gt[p.gi].id} read as ${it.cardId}`); }
    }
    items.forEach((it, i) => { if (!matchedDet.has(i)) console.log(`    extra: ${it.confidence} ${it.cardId ?? "-"} inliers ${it.inliers}`); });
  }
  const miss = gt.filter((_, gi) => !pairs.some((p) => p.gi === gi)).map((g) => g.id);
  if (miss.length) console.log(`    missed: ${miss.join(", ")}`);
  Object.assign(tot, { gt: tot.gt + gt.length, found: tot.found + pairs.length, fp: tot.fp + fp, iou: tot.iou + iou, piles: tot.piles + piles.length, pilesFound: tot.pilesFound + pilesFound, idOk: tot.idOk + idOk, ms: tot.ms + ms });

  const over = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
  for (const g of gt) drawQuad(over, g.quad, [0, 255, 0]);
  items.forEach((d, i) => drawQuad(over, d.quad, matchedDet.has(i) ? [255, 140, 0] : [255, 0, 0]));
  writeFileSync(join(OUT, `${MODE}-${photo}`), jpeg.encode({ width: over.width, height: over.height, data: Buffer.from(over.data) }, 82).data);
}
console.log(`\n${MODE.toUpperCase()}: top cards found ${tot.found}/${tot.gt}  false positives ${tot.fp}  mean IoU ${(tot.iou / Math.max(1, tot.found)).toFixed(3)}` +
  (IDENTIFY ? `  piles ${tot.pilesFound}/${tot.piles}  ids correct ${tot.idOk}/${tot.found}  sure-but-wrong ${tot.sureWrong}` : "") + `  total ${Math.round(tot.ms)}ms`);
process.exit(0);
