#!/usr/bin/env node
/** Synthetic harness for "scan every card in a photo".
 *
 * Builds scenes from reference card art (binder pages, table spreads with
 * rotation, perspective, touching cards, JPEG, blur), runs the real
 * detect -> rectify -> match pipeline in Node, and prints per-scene detection
 * recall/precision (IoU against the ground-truth quads) and identification
 * accuracy.
 *
 *   cd frontend
 *   LIMIT=240 node scripts/fetch-reference-images.mjs .scan-build/refs
 *   npx tsx scripts/extract-descriptors.mjs .scan-build/refs .scan-build/desc
 *   npx tsx scripts/multi-scan-harness.mjs            # all scenes
 *   SCENES=6 SEED=3 npx tsx scripts/multi-scan-harness.mjs
 *   DETECT_ONLY=1 npx tsx scripts/multi-scan-harness.mjs   # detection numbers only, fast
 *
 * Scenes and detection overlays are written to .scan-build/scenes/ (gitignored).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import jpeg from "jpeg-js";
import { decodeRecord } from "../src/descriptorCache.ts";
import { buildCandidates } from "../src/cardScanMatch.ts";
import { getCv } from "../src/cardMatch.ts";
import { findCardQuads, quadIoU } from "../src/cardDetect.ts";
import { matchAllCardsWith } from "../src/cardScanMulti.ts";
import { applyHomography, computeHomography } from "../src/cardRectify.ts";

const REFS = process.env.REFS || ".scan-build/refs";
const DESC = process.env.DESC || ".scan-build/desc";
const OUT = process.env.OUT || ".scan-build/scenes";
const SEED = Number(process.env.SEED || 1);
const SCENES = Number(process.env.SCENES || 30);
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------- scene drawing

class Scene {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = new Uint8ClampedArray(w * h * 4);
    this.gt = [];
  }
  fill(fn) {
    for (let y = 0; y < this.h; y += 1) {
      for (let x = 0; x < this.w; x += 1) {
        const c = fn(x, y);
        const o = (y * this.w + x) * 4;
        this.px[o] = c[0];
        this.px[o + 1] = c[1];
        this.px[o + 2] = c[2];
        this.px[o + 3] = 255;
      }
    }
  }
}

function polyMask(cv, w, h, quad) {
  const m = new cv.Mat.zeros(h, w, cv.CV_8UC1);
  const pts = cv.matFromArray(4, 1, cv.CV_32SC2, quad.flatMap((p) => [Math.round(p.x), Math.round(p.y)]));
  const v = new cv.MatVector();
  v.push_back(pts);
  cv.fillPoly(m, v, new cv.Scalar(255));
  v.delete();
  pts.delete();
  return m;
}

/** Paint a flat-coloured polygon (sheet, pocket) onto the scene. */
function paintPoly(cv, scene, quad, color) {
  const m = polyMask(cv, scene.w, scene.h, quad);
  for (let i = 0; i < m.data.length; i += 1) {
    if (m.data[i]) {
      scene.px[i * 4] = color[0];
      scene.px[i * 4 + 1] = color[1];
      scene.px[i * 4 + 2] = color[2];
    }
  }
  m.delete();
}

/** Round the corners of a card image by clearing its alpha there. */
function roundedAlpha(img) {
  const r = Math.round(img.width * 0.045);
  const { width: w, height: h, data } = img;
  const out = new Uint8ClampedArray(data);
  const corner = (cx, cy) => {
    for (let y = 0; y < r; y += 1) {
      for (let x = 0; x < r; x += 1) {
        const px = cx ? w - 1 - x : x;
        const py = cy ? h - 1 - y : y;
        if (Math.hypot(r - 0.5 - x, r - 0.5 - y) > r) out[(py * w + px) * 4 + 3] = 0;
      }
    }
  };
  corner(0, 0); corner(1, 0); corner(0, 1); corner(1, 1);
  return { width: w, height: h, data: out };
}

/** Draw a card (RGBA with alpha) into the scene at `quad`, with an optional soft shadow. */
function placeCard(cv, scene, card, quad, { shadow = true, gloss = 0 } = {}) {
  const { w, h } = scene;
  const src = cv.matFromArray(card.height, card.width, cv.CV_8UC4, card.data);
  const from = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, card.width, 0, card.width, card.height, 0, card.height]);
  const to = cv.matFromArray(4, 1, cv.CV_32FC2, quad.flatMap((p) => [p.x, p.y]));
  const M = cv.getPerspectiveTransform(from, to);
  const dst = new cv.Mat();
  cv.warpPerspective(src, dst, M, new cv.Size(w, h), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(0, 0, 0, 0));

  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)) - 30);
  const x1 = Math.min(w, Math.ceil(Math.max(...xs)) + 30);
  const y0 = Math.max(0, Math.floor(Math.min(...ys)) - 30);
  const y1 = Math.min(h, Math.ceil(Math.max(...ys)) + 30);
  const d = dst.data;

  if (shadow) {
    const a = new cv.Mat(h, w, cv.CV_8UC1);
    for (let i = 0; i < w * h; i += 1) a.data[i] = d[i * 4 + 3];
    const sh = new cv.Mat();
    cv.GaussianBlur(a, sh, new cv.Size(0, 0), 5);
    const dx = 5;
    const dy = 7;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const sx = x - dx;
        const sy = y - dy;
        if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
        const k = 1 - 0.45 * (sh.data[sy * w + sx] / 255);
        const o = (y * w + x) * 4;
        scene.px[o] *= k;
        scene.px[o + 1] *= k;
        scene.px[o + 2] *= k;
      }
    }
    a.delete();
    sh.delete();
  }
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const o = (y * w + x) * 4;
      const al = d[o + 3] / 255;
      if (!al) continue;
      for (let c = 0; c < 3; c += 1) {
        let v = d[o + c];
        if (gloss) v = v + gloss * (255 - v) * (0.5 + 0.5 * Math.sin((x + y) / 60));
        scene.px[o + c] = scene.px[o + c] * (1 - al) + v * al;
      }
    }
  }
  src.delete(); from.delete(); to.delete(); M.delete(); dst.delete();
}

function rotQuad(cx, cy, w, h, deg) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => ({
    x: cx + x * c - y * s,
    y: cy + x * s + y * c,
  }));
}

const BG = {
  wood: [120, 84, 52], white: [236, 234, 228], felt: [26, 92, 58], dark: [34, 34, 40],
  blue: [40, 70, 140], grey: [150, 150, 152], red: [150, 40, 44],
};

function background(scene, kind, r) {
  const { w, h } = scene;
  if (kind === "noise") {
    const base = [100 + r() * 80, 90 + r() * 80, 80 + r() * 80];
    // Blotchy low-frequency texture plus per-pixel grain.
    const gx = 16;
    const grid = Array.from({ length: gx * gx }, () => (r() - 0.5) * 60);
    scene.fill((x, y) => {
      const fx = (x / w) * (gx - 1);
      const fy = (y / h) * (gx - 1);
      const v = grid[Math.floor(fy) * gx + Math.floor(fx)] + (r() - 0.5) * 36;
      return [base[0] + v, base[1] + v, base[2] + v];
    });
  } else if (kind === "gradient") {
    const a = [30 + r() * 60, 40 + r() * 60, 60 + r() * 100];
    const b = [150 + r() * 80, 120 + r() * 80, 90 + r() * 80];
    scene.fill((x, y) => {
      const t = (x / w + y / h) / 2;
      return a.map((v, i) => v + (b[i] - v) * t);
    });
  } else {
    const c = BG[kind];
    scene.fill(() => c);
  }
}

// ---------------------------------------------------------------- scene kinds

function binderScene(cv, cards, cols, rows, r, bgKind, sheetColor) {
  const pocketW = 400;
  const pocketH = Math.round(pocketW * 88 / 63);
  const gap = 14 + Math.round(r() * 8);
  const pad = 46;
  const pageW = cols * pocketW + (cols - 1) * gap + pad * 2;
  const pageH = rows * pocketH + (rows - 1) * gap + pad * 2;
  const margin = 80;
  const scene = new Scene(pageW + margin * 2, pageH + margin * 2);
  background(scene, bgKind, r);
  paintPoly(cv, scene, [
    { x: margin, y: margin }, { x: margin + pageW, y: margin },
    { x: margin + pageW, y: margin + pageH }, { x: margin, y: margin + pageH },
  ], sheetColor);
  // A pocket is a slightly lighter plastic sleeve, a touch bigger than the card.
  const lighter = sheetColor.map((v) => Math.min(255, v + 22));
  const empty = Math.floor(r() * 2); // 0-1 empty pockets
  const skip = new Set();
  for (let i = 0; i < empty; i += 1) skip.add(Math.floor(r() * cols * rows));
  let n = 0;
  for (let ry = 0; ry < rows; ry += 1) {
    for (let cx = 0; cx < cols; cx += 1) {
      const x = margin + pad + cx * (pocketW + gap);
      const y = margin + pad + ry * (pocketH + gap);
      paintPoly(cv, scene, [
        { x, y }, { x: x + pocketW, y }, { x: x + pocketW, y: y + pocketH }, { x, y: y + pocketH },
      ], lighter);
      const card = cards[n % cards.length];
      n += 1;
      if (skip.has(ry * cols + cx)) continue;
      const jx = (r() - 0.5) * 8;
      const jy = (r() - 0.5) * 8;
      const q = rotQuad(x + pocketW / 2 + jx, y + pocketH / 2 + jy, pocketW - 22, pocketH - 22, (r() - 0.5) * 2);
      placeCard(cv, scene, roundedAlpha(card.img), q, { shadow: false, gloss: 0.05 });
      scene.gt.push({ cardId: card.cardId, quad: q });
    }
  }
  return scene;
}

function tableScene(cv, cards, count, r, bgKind, { touching = 0 } = {}) {
  const w = 2000;
  const h = 1500;
  const scene = new Scene(w, h);
  background(scene, bgKind, r);
  const cw = 300;
  const ch = Math.round(cw * 88 / 63);
  const placed = [];
  const fits = (q) =>
    q.every((p) => p.x > 25 && p.x < w - 25 && p.y > 25 && p.y < h - 25) &&
    placed.every((o) => !overlap(q, o.quad, 8));
  let tries = 0;
  const place = (q, card) => {
    placed.push({ quad: q, card });
  };
  // Touching pairs first: second card flush against the first.
  for (let t = 0; t < touching; t += 1) {
    for (let a = 0; a < 200; a += 1) {
      const cx = 350 + r() * (w - 700);
      const cy = 350 + r() * (h - 700);
      const deg = (r() - 0.5) * 20;
      const q1 = rotQuad(cx, cy, cw, ch, deg);
      const rad = (deg * Math.PI) / 180;
      const step = cw + 2 + r() * 2;
      const q2 = rotQuad(cx + step * Math.cos(rad), cy + step * Math.sin(rad), cw, ch, deg);
      if (fits(q1) && fits(q2)) {
        place(q1, cards[placed.length % cards.length]);
        place(q2, cards[placed.length % cards.length]);
        break;
      }
    }
  }
  while (placed.length < count && tries < 5000) {
    tries += 1;
    const sideways = r() < 0.25;
    const deg = (r() - 0.5) * 50 + (sideways ? 90 : 0);
    const scale = 0.85 + r() * 0.3;
    const q = rotQuad(120 + r() * (w - 240), 120 + r() * (h - 240), cw * scale, ch * scale, deg);
    if (fits(q)) place(q, cards[placed.length % cards.length]);
  }
  for (const p of placed) {
    placeCard(cv, scene, roundedAlpha(p.card.img), p.quad, { shadow: true });
    scene.gt.push({ cardId: p.card.cardId, quad: p.quad });
  }
  return scene;
}

function overlap(a, b, pad) {
  const bb = (q) => [Math.min(...q.map((p) => p.x)) - pad, Math.min(...q.map((p) => p.y)) - pad, Math.max(...q.map((p) => p.x)) + pad, Math.max(...q.map((p) => p.y)) + pad];
  const [a0, a1, a2, a3] = bb(a);
  const [b0, b1, b2, b3] = bb(b);
  if (a2 < b0 || b2 < a0 || a3 < b1 || b3 < a1) return false;
  // Bounding boxes of rotated cards overlap a lot; use the real polygons.
  return quadIoU(a, b) > 0 || polysTouch(a, b, pad);
}
function polysTouch(a, b, pad) {
  const inside = (p, q) => {
    let s = 0;
    for (let i = 0; i < 4; i += 1) {
      const u = q[i];
      const v = q[(i + 1) % 4];
      const cr = (v.x - u.x) * (p.y - u.y) - (v.y - u.y) * (p.x - u.x);
      const len = Math.hypot(v.x - u.x, v.y - u.y);
      if (cr / len < -pad) return false;
      s += cr;
    }
    return true;
  };
  return a.some((p) => inside(p, b)) || b.some((p) => inside(p, a));
}

/** Global camera: rotation, mild perspective, then blur / brightness / JPEG. */
function photograph(cv, scene, r, { rotate = 0, perspective = 0.04, blur = 0, bright = 1, jpegQ = 85 } = {}) {
  const { w, h } = scene;
  const src = cv.matFromArray(h, w, cv.CV_8UC4, scene.px);
  const c = { x: w / 2, y: h / 2 };
  const jitter = () => (r() - 0.5) * 2 * perspective;
  const rad = (rotate * Math.PI) / 180;
  const rot = (p) => ({
    x: c.x + (p.x - c.x) * Math.cos(rad) - (p.y - c.y) * Math.sin(rad),
    y: c.y + (p.x - c.x) * Math.sin(rad) + (p.y - c.y) * Math.cos(rad),
  });
  const corners = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  const moved = corners.map((p) => {
    const q = rot(p);
    return { x: q.x + jitter() * w, y: q.y + jitter() * h };
  });
  // Keep the output frame the same; the scene shrinks a touch so edges stay in view.
  const shrink = 0.9;
  const dstQ = moved.map((p) => ({ x: c.x + (p.x - c.x) * shrink, y: c.y + (p.y - c.y) * shrink }));
  const from = cv.matFromArray(4, 1, cv.CV_32FC2, corners.flatMap((p) => [p.x, p.y]));
  const to = cv.matFromArray(4, 1, cv.CV_32FC2, dstQ.flatMap((p) => [p.x, p.y]));
  const M = cv.getPerspectiveTransform(from, to);
  const dst = new cv.Mat();
  cv.warpPerspective(src, dst, M, new cv.Size(w, h), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
  if (blur > 0) cv.GaussianBlur(dst, dst, new cv.Size(0, 0), blur);

  const H = computeHomography(corners, dstQ);
  const gt = scene.gt.map((g) => ({ cardId: g.cardId, quad: g.quad.map((p) => applyHomography(H, p)) }));

  const data = new Uint8ClampedArray(dst.data.length);
  for (let i = 0; i < data.length; i += 4) {
    const n = (r() - 0.5) * 6;
    data[i] = dst.data[i] * bright + n;
    data[i + 1] = dst.data[i + 1] * bright + n;
    data[i + 2] = dst.data[i + 2] * bright + n;
    data[i + 3] = 255;
  }
  src.delete(); dst.delete(); from.delete(); to.delete(); M.delete();
  const enc = jpeg.encode({ data, width: w, height: h }, jpegQ);
  const dec = jpeg.decode(enc.data, { useTArray: true });
  return { image: { data: new Uint8ClampedArray(dec.data), width: w, height: h }, jpegBytes: enc.data, gt };
}

// ---------------------------------------------------------------- evaluation

function drawLine(img, a, b, color) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
  for (let i = 0; i <= n; i += 1) {
    const x = Math.round(a.x + ((b.x - a.x) * i) / n);
    const y = Math.round(a.y + ((b.y - a.y) * i) / n);
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const px = x + dx;
        const py = y + dy;
        if (px < 0 || py < 0 || px >= img.width || py >= img.height) continue;
        const o = (py * img.width + px) * 4;
        img.data[o] = color[0]; img.data[o + 1] = color[1]; img.data[o + 2] = color[2];
      }
    }
  }
}

function overlay(image, gt, det) {
  const img = { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
  const poly = (q, col) => q.forEach((p, i) => drawLine(img, p, q[(i + 1) % 4], col));
  gt.forEach((g) => poly(g.quad, [0, 255, 0]));
  det.forEach((d) => poly(d.quad, [255, 0, 0]));
  return jpeg.encode(img, 70).data;
}

function assign(gt, det) {
  const pairs = [];
  gt.forEach((g, gi) => det.forEach((d, di) => {
    const iou = quadIoU(g.quad, d.quad);
    if (iou >= 0.5) pairs.push({ gi, di, iou });
  }));
  pairs.sort((a, b) => b.iou - a.iou);
  const usedG = new Set();
  const usedD = new Set();
  const out = [];
  for (const p of pairs) {
    if (usedG.has(p.gi) || usedD.has(p.di)) continue;
    usedG.add(p.gi);
    usedD.add(p.di);
    out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------- main

async function loadCandidates() {
  const manifest = JSON.parse(readFileSync(join(DESC, "descriptors.manifest.json"), "utf8"));
  const records = [];
  for (const chunk of manifest.chunks) {
    const file = readFileSync(join(DESC, chunk.file));
    const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    for (const rec of chunk.records) records.push(decodeRecord(buf, rec.offset, rec.cardId));
  }
  return buildCandidates(records);
}

function loadCards(r) {
  const index = JSON.parse(readFileSync(join(REFS, "index.json"), "utf8"));
  // One printing per card number so ground truth is unambiguous.
  const seen = new Set();
  const cards = [];
  for (const e of index) {
    if (seen.has(e.card_id)) continue;
    seen.add(e.card_id);
    const raw = jpeg.decode(readFileSync(join(REFS, e.file)), { useTArray: true });
    cards.push({ cardId: e.card_id, img: { width: raw.width, height: raw.height, data: raw.data } });
  }
  return cards;
}

function pick(cards, n, r) {
  const pool = [...cards];
  const out = [];
  for (let i = 0; i < n && pool.length; i += 1) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
}

function plan() {
  const list = [];
  const bgs = ["wood", "white", "felt", "dark", "blue", "grey", "noise", "gradient"];
  const sheets = [[22, 22, 28], [30, 36, 70], [90, 26, 30], [18, 18, 18], [210, 208, 200]];
  let i = 0;
  const add = (spec) => list.push({ name: `${String(i += 1).padStart(2, "0")}-${spec.label}`, ...spec });
  for (let k = 0; k < 6; k += 1) add({ label: "binder3x3", kind: "binder", cols: 3, rows: 3, bg: bgs[k], sheet: sheets[k % 5], cam: { rotate: (k - 2) * 1.5, perspective: 0.025, blur: k % 3 === 0 ? 1 : 0, bright: 0.9 + (k % 3) * 0.08, jpegQ: 80 } });
  for (let k = 0; k < 4; k += 1) add({ label: "binder4x3", kind: "binder", cols: 4, rows: 3, bg: bgs[(k + 3) % 8], sheet: sheets[(k + 1) % 5], cam: { rotate: (k - 1.5) * 1.5, perspective: 0.025, blur: k % 2 ? 0.8 : 0, bright: 1, jpegQ: 85 } });
  for (let k = 0; k < 16; k += 1) {
    add({ label: `table${2 + (k % 11)}`, kind: "table", count: 2 + (k % 11), bg: bgs[k % 8], touching: 0, cam: { rotate: 0, perspective: 0.03, blur: k % 4 === 0 ? 1.2 : 0, bright: 0.85 + (k % 4) * 0.1, jpegQ: 75 + (k % 3) * 8 } });
  }
  for (let k = 0; k < 4; k += 1) add({ label: "touching", kind: "table", count: 5 + k, bg: bgs[(k * 2) % 8], touching: 1 + (k % 2), cam: { rotate: 0, perspective: 0.02, blur: 0, bright: 1, jpegQ: 85 } });
  return list;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const cv = await getCv();
  const t0 = Date.now();
  const candidates = await loadCandidates();
  console.log(`candidates: ${candidates.length} (${Date.now() - t0} ms)`);
  const cards = loadCards();
  const specs = plan().map((x, idx) => ({ ...x, idx })).slice(0, SCENES).filter((s) => !ONLY || ONLY.some((o) => s.name.includes(o)));

  const tot = { gt: 0, det: 0, tp: 0, idOk: 0, sure: 0, sureWrong: 0, check: 0, none: 0, ms: 0, detMs: 0, iou: 0 };
  console.log("scene                 size       gt det  recall prec  idOK  sure/check/none sureWrong  detMs  totalMs");
  for (let si = 0; si < specs.length; si += 1) {
    const spec = specs[si];
    const r = rng(SEED * 1000 + spec.idx);
    const n = spec.kind === "binder" ? spec.cols * spec.rows : spec.count;
    const chosen = pick(cards, n, r);
    const scene = spec.kind === "binder"
      ? binderScene(cv, chosen, spec.cols, spec.rows, r, spec.bg, spec.sheet)
      : tableScene(cv, chosen, spec.count, r, spec.bg, { touching: spec.touching });
    const shot = photograph(cv, scene, r, spec.cam);
    const gt = shot.gt;

    const td = Date.now();
    findCardQuads(cv, shot.image, { fallback: false });
    const detMs = Date.now() - td;

    const t1 = Date.now();
    // DETECT_ONLY=1 skips identification, for quick detector tuning.
    const det = process.env.DETECT_ONLY
      ? findCardQuads(cv, shot.image).map((quad) => ({ quad, cardId: null, confidence: "none" }))
      : await matchAllCardsWith({ thumbnail: () => "" }, shot.image, candidates);
    const ms = Date.now() - t1;
    // Detection ran with the fallback here; for precision count only real detections.
    const pairs = assign(gt, det);
    let idOk = 0, sure = 0, check = 0, none = 0, sureWrong = 0, iouSum = 0;
    for (const p of pairs) {
      const d = det[p.di];
      iouSum += p.iou;
      const ok = d.cardId === gt[p.gi].cardId;
      if (ok) idOk += 1;
      else console.log(`    wrong: truth ${gt[p.gi].cardId}, read ${d.cardId} (${d.confidence}, inliers ${d.inliers}, runner-up ${d.runnerUp}, iou ${p.iou.toFixed(2)})`);
      if (d.confidence === "sure") { sure += 1; if (!ok) sureWrong += 1; }
      else if (d.confidence === "check") check += 1;
      else none += 1;
    }
    const recall = gt.length ? pairs.length / gt.length : 1;
    const prec = det.length ? pairs.length / det.length : 1;
    console.log(
      `${spec.name.padEnd(20)} ${`${shot.image.width}x${shot.image.height}`.padEnd(10)} ${String(gt.length).padStart(2)} ${String(det.length).padStart(3)}  ` +
      `${recall.toFixed(2)}   ${prec.toFixed(2)}  ${idOk}/${pairs.length}`.padEnd(14) +
      `  ${sure}/${check}/${none}`.padEnd(14) + `   ${sureWrong}`.padEnd(10) + `${String(detMs).padStart(6)} ${String(ms).padStart(7)}`,
    );
    tot.gt += gt.length; tot.det += det.length; tot.tp += pairs.length; tot.idOk += idOk;
    tot.sure += sure; tot.check += check; tot.none += none; tot.sureWrong += sureWrong;
    tot.ms += ms; tot.detMs += detMs; tot.iou += iouSum;

    writeFileSync(join(OUT, `${spec.name}.jpg`), shot.jpegBytes);
    writeFileSync(join(OUT, `${spec.name}.gt.json`), JSON.stringify(gt));
    writeFileSync(join(OUT, `${spec.name}.overlay.jpg`), overlay(shot.image, gt, det));
  }
  const n = specs.length;
  console.log("\nTOTAL");
  console.log(`  detection recall    ${(tot.tp / tot.gt * 100).toFixed(1)}%  (${tot.tp}/${tot.gt})`);
  console.log(`  detection precision ${(tot.tp / tot.det * 100).toFixed(1)}%  (${tot.tp}/${tot.det})`);
  console.log(`  mean IoU of matches ${(tot.iou / tot.tp).toFixed(3)}`);
  console.log(`  id correct          ${(tot.idOk / tot.gt * 100).toFixed(1)}% of all cards, ${(tot.idOk / tot.tp * 100).toFixed(1)}% of detected`);
  console.log(`  sure/check/none     ${tot.sure}/${tot.check}/${tot.none}   sure-but-wrong: ${tot.sureWrong}`);
  console.log(`  ms per scene        detect ${Math.round(tot.detMs / n)}, detect+identify ${Math.round(tot.ms / n)} (${candidates.length} candidates)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
