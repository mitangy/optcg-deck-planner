/** Detect the treatment marker printed beside a card's collector number.
 *
 * One card number can span wildly different printings — OP16-073 runs from
 * $0.11 to $1043 — and the face distinguishes them with a small star above the
 * rarity badge:
 *
 *   no star      → base printing
 *   white star   → alternate art / parallel
 *   gold star    → manga, and the badge, cost circle and number all turn gold
 *
 * OCR cannot help here: a star is not in any character alphabet, so Tesseract
 * can only hallucinate a nearby glyph. This is a shape-and-hue question, and
 * an easy one — the marker sits at a fixed offset from the number, is high
 * contrast, and only has three states.
 */

import { REGIONS, regionToBox } from "./cardRectify";
/* eslint-disable @typescript-eslint/no-unused-vars */

/** Pixel box, matching Tesseract's word bbox shape. */
export type Box = { x0: number; y0: number; x1: number; y1: number };

export type Treatment = "base" | "special" | "manga";

export type MarkerResult = {
  treatment: Treatment;
  /** 0–1. Low values mean the caller should ask rather than assume. */
  confidence: number;
  /** Raw measurements, retained for diagnostics. */
  metrics: {
    starBrightFraction: number;
    goldFraction: number;
    bandLuma: number;
  };
};

/** Bright enough to be ink on the dark band rather than the band itself. */
const BRIGHT_MARGIN = 45;

/** A star occupying at least this share of its box counts as present.
 *  Measured: present 0.10–0.12, absent 0.018–0.021, so the midpoint is safe. */
const STAR_PRESENT = 0.06;

/** Share of bright pixels that must read gold for the manga treatment. */
const GOLD_SHARE = 0.4;

function clampBox(box: Box, w: number, h: number): Box {
  return {
    x0: Math.max(0, Math.min(w - 1, Math.round(box.x0))),
    y0: Math.max(0, Math.min(h - 1, Math.round(box.y0))),
    x1: Math.max(1, Math.min(w, Math.round(box.x1))),
    y1: Math.max(1, Math.min(h, Math.round(box.y1))),
  };
}

/**
 * Locate the white rarity badge ("R", "SR", "L", …) in the bottom-right band.
 *
 * Anchoring to the badge rather than a fixed fraction of the card is what
 * makes this generalise: the badge is a high-contrast white rectangle on every
 * card regardless of colour or set, so it supplies both the position to look
 * above and the scale to expect. A fixed region drifted enough between cards
 * to clip the badge itself, which read as a false star on most base printings.
 */
export function findRarityBadge(data: ImageData): Box | null {
  const W = data.width;
  const H = data.height;
  // The badge always sits in the bottom-right of the card face.
  const x0 = Math.round(W * 0.62);
  const x1 = Math.round(W * 0.98);
  const y0 = Math.round(H * 0.915);
  const y1 = Math.round(H * 0.98);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return null;

  // Band colour dominates the strip, so its median luma is the background.
  const lumas: number[] = [];
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * W + x) * 4;
      lumas.push(data.data[i] * 0.299 + data.data[i + 1] * 0.587 + data.data[i + 2] * 0.114);
    }
  }
  const sorted = [...lumas].sort((a, b) => a - b);
  const band = sorted[Math.floor(sorted.length / 2)];
  const bright = sorted[Math.floor(sorted.length * 0.98)];
  // Need real separation between band and ink to trust anything here.
  if (bright - band < 40) return null;
  const threshold = band + (bright - band) * 0.55;

  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      mask[y * w + x] = lumas[y * w + x] >= threshold ? 1 : 0;
    }
  }

  // Connected components, 4-neighbour, iterative flood fill.
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  type Comp = { minX: number; maxX: number; minY: number; maxY: number; area: number };
  const comps: Comp[] = [];
  for (let s = 0; s < mask.length; s += 1) {
    if (!mask[s] || seen[s]) continue;
    stack.length = 0;
    stack.push(s);
    seen[s] = 1;
    const c: Comp = { minX: w, maxX: 0, minY: h, maxY: 0, area: 0 };
    while (stack.length) {
      const p = stack.pop() as number;
      const px = p % w;
      const py = (p / w) | 0;
      c.area += 1;
      if (px < c.minX) c.minX = px;
      if (px > c.maxX) c.maxX = px;
      if (py < c.minY) c.minY = py;
      if (py > c.maxY) c.maxY = py;
      if (px > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
      if (px < w - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
      if (py > 0 && mask[p - w] && !seen[p - w]) { seen[p - w] = 1; stack.push(p - w); }
      if (py < h - 1 && mask[p + w] && !seen[p + w]) { seen[p + w] = 1; stack.push(p + w); }
    }
    comps.push(c);
  }

  // The badge is a filled, roughly square block — unlike the number's thin
  // glyphs or the cost circle, which is round and sits further right.
  const candidates = comps
    .map((c) => {
      const cw = c.maxX - c.minX + 1;
      const ch = c.maxY - c.minY + 1;
      return { c, cw, ch, aspect: cw / ch, fill: c.area / (cw * ch) };
    })
    .filter(
      (v) =>
        // Measured on a rectified card: the badge is ~22×13 in a ~289×73
        // strip, i.e. well under a fifth of the strip height. The cost circle
        // is taller (~32) and the card border spans the whole strip.
        v.ch >= h * 0.1 &&
        v.ch <= h * 0.32 &&
        v.aspect >= 0.8 &&
        v.aspect <= 2.6 &&
        // A solid block. The cost circle scores ~0.47 against its bounding
        // box because it is round; the badge scores ~0.8.
        v.fill >= 0.65,
    );
  if (!candidates.length) return null;
  // Rightmost qualifying block — the number's glyphs sit further left.
  candidates.sort((a, b) => b.c.maxX - a.c.maxX);
  const best = candidates[0];
  return {
    x0: x0 + best.c.minX,
    y0: y0 + best.c.minY,
    x1: x0 + best.c.maxX + 1,
    y1: y0 + best.c.maxY + 1,
  };
}

/** The star sits directly above the badge, at roughly the badge's own size. */
export function starBoxFromBadge(badge: Box): Box {
  const bw = badge.x1 - badge.x0;
  const bh = badge.y1 - badge.y0;
  return {
    x0: badge.x0 - bw * 0.1,
    y0: badge.y0 - bh * 1.05,
    x1: badge.x1 + bw * 0.1,
    // Stop just short of the badge so its white edge cannot count as a star.
    y1: badge.y0 - bh * 0.08,
  };
}

type Stats = { bright: number; total: number; gold: number; meanLuma: number };

function sample(data: ImageData, box: Box, threshold: number): Stats {
  const b = clampBox(box, data.width, data.height);
  let bright = 0;
  let gold = 0;
  let total = 0;
  let lumaSum = 0;
  for (let y = b.y0; y < b.y1; y += 1) {
    for (let x = b.x0; x < b.x1; x += 1) {
      const i = (y * data.width + x) * 4;
      const r = data.data[i];
      const g = data.data[i + 1];
      const bl = data.data[i + 2];
      const luma = r * 0.299 + g * 0.587 + bl * 0.114;
      lumaSum += luma;
      total += 1;
      if (luma < threshold) continue;
      bright += 1;
      // Gold reads as red≈green, both clearly above blue. Checking the channel
      // relationship rather than absolute hue keeps it robust to white balance.
      const warm = Math.min(r, g) - bl;
      const balanced = Math.abs(r - g) < 60;
      if (warm > 35 && balanced) gold += 1;
    }
  }
  return { bright, total, gold, meanLuma: total ? lumaSum / total : 0 };
}

/**
 * Classify the treatment of a **rectified** card.
 *
 * The card must already be flattened by `rectifyToCanvas`, which is what makes
 * this reliable: on a rectified card the star and badge are at fixed
 * fractional coordinates, so nothing depends on first locating text. Measured
 * separation on perspective-distorted photos is ~6× between star present
 * (0.10–0.12) and absent (0.018–0.021).
 */
export function detectTreatment(data: ImageData): MarkerResult {
  const w = data.width;
  const badgeBox = findRarityBadge(data);
  if (!badgeBox) {
    return {
      treatment: "base",
      confidence: 0,
      metrics: { starBrightFraction: 0, goldFraction: 0, bandLuma: 0 },
    };
  }
  const starBox = starBoxFromBadge(badgeBox);
  // Reference: the band immediately left of the badge, at the star's height,
  // so the threshold tracks this card's own colour rather than a global guess.
  const bw = badgeBox.x1 - badgeBox.x0;
  const band = sample(
    data,
    { x0: badgeBox.x0 - bw * 4, y0: starBox.y0, x1: badgeBox.x0 - bw * 1.2, y1: starBox.y1 },
    255,
  );
  const threshold = Math.min(240, band.meanLuma + BRIGHT_MARGIN);

  const star = sample(data, starBox, threshold);
  const badge = sample(data, badgeBox, threshold);

  const starBrightFraction = star.total ? star.bright / star.total : 0;
  // Gold is judged over star and badge together: on manga printings the whole
  // cluster shifts hue, which is a far larger signal than the star alone.
  const brightTotal = star.bright + badge.bright;
  const goldFraction = brightTotal ? (star.gold + badge.gold) / brightTotal : 0;

  const hasStar = starBrightFraction >= STAR_PRESENT;
  const isGold = goldFraction >= GOLD_SHARE;

  let treatment: Treatment = "base";
  if (hasStar) treatment = isGold ? "manga" : "special";
  else if (isGold) treatment = "manga"; // gold cluster with a washed-out star

  // Confidence falls off near each threshold, where a wrong call is likeliest.
  const starMargin = Math.abs(starBrightFraction - STAR_PRESENT) / STAR_PRESENT;
  const goldMargin = Math.abs(goldFraction - GOLD_SHARE) / GOLD_SHARE;
  const confidence = Math.max(0, Math.min(1, Math.min(starMargin, 1) * 0.6 + Math.min(goldMargin, 1) * 0.4));

  return {
    treatment,
    confidence,
    metrics: { starBrightFraction, goldFraction, bandLuma: band.meanLuma },
  };
}

/** Printing shape the picker needs. */
export type PrintingLike = {
  product_id: number;
  name: string;
  market_price: number | null;
  is_special: boolean;
};

const MANGA_RE = /\bmanga\b/i;

/**
 * Choose the printing that matches a detected treatment.
 *
 * Returns null when nothing fits, so the caller can show the full list rather
 * than assert a price it cannot justify.
 */
export function pickPrinting<T extends PrintingLike>(
  printings: readonly T[],
  treatment: Treatment,
): T | null {
  if (!printings.length) return null;
  if (treatment === "manga") {
    return printings.find((p) => MANGA_RE.test(p.name)) ?? null;
  }
  if (treatment === "special") {
    // Prefer a non-manga special; manga is its own, much pricier tier.
    return printings.find((p) => p.is_special && !MANGA_RE.test(p.name)) ?? null;
  }
  return printings.find((p) => !p.is_special) ?? null;
}
