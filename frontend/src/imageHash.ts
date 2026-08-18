/** Perceptual hash for matching a scanned card against reference images.
 *
 * This is the one piece of the scan pipeline that has to behave identically
 * wherever it runs: the frontend hashes a rectified phone photo, and a Node
 * script (frontend/scripts/hash-catalog.mjs) hashes each catalog printing's
 * reference photo using this exact module, so the two sides can be compared
 * by Hamming distance. Keeping it dependency-free and DOM-free (plain
 * {width,height,data} in, no Canvas/ImageData type) is what lets both sides
 * import the same file.
 *
 * Three signals are combined, all block-average-based rather than DCT-based
 * (classic pHash) — pure integer/average arithmetic, nothing subtle to get
 * wrong or to drift between two independent ports:
 *  - a luma blockhash (structure: is this block lighter or darker than typical)
 *  - a luma gradient ("dHash": is this block lighter than its neighbour),
 *    which is illumination-shift-tolerant almost by definition — useful since
 *    foil/glare mostly shifts absolute brightness, not relative structure
 *  - a per-block color-dominance hash (which channel — R/G/B/neutral —
 *    dominates), since OPTCG cards are strongly color-coded and a card's own
 *    color is a signal luma alone throws away
 *
 * Every catalog reference photo carries a "SAMPLE" watermark baked in by
 * TCGPlayer across every size variant — there is no unwatermarked source, so
 * a fixed horizontal band is excluded from every signal on BOTH sides,
 * always, rather than treated as noise to average through. Because the
 * excluded rows are a fixed property of the grid (not data-dependent), hash
 * length is always the same regardless of image content.
 */

/** Minimal shape both a browser Canvas ImageData and a decoded Node buffer satisfy. */
export type PixelSource = {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row-major — same layout as CanvasRenderingContext2D's ImageData. */
  data: Uint8ClampedArray | Uint8Array;
};

/** Fractional vertical band covering the reference watermark on every card. */
const EXCLUDED_ROWS: readonly [number, number] = [0.4, 0.62];

/** Grid for the luma blockhash + gradient hash (finer catches more structure). */
const GRID_LUMA = 16;
/** Coarser grid for color dominance — color is a broad-strokes signal. */
const GRID_COLOR = 8;

type Block = { luma: number; r: number; g: number; b: number };

function includedRows(grid: number): boolean[] {
  const included: boolean[] = [];
  for (let row = 0; row < grid; row += 1) {
    const center = (row + 0.5) / grid;
    included.push(center < EXCLUDED_ROWS[0] || center > EXCLUDED_ROWS[1]);
  }
  return included;
}

/**
 * A blown-out reflection reads as bright AND desaturated (a specular
 * highlight is the light source's own color — usually near-white —
 * overwhelming whatever color the surface actually is, regardless of white
 * balance). A rainbow-shifted foil sheen is neither: it's saturated color,
 * just not the card's true color, so this deliberately does not try to catch
 * that — only genuine blown-out hotspots, which are unambiguous.
 */
const SPECULAR_LUMA_MIN = 235;
const SPECULAR_SPREAD_MAX = 30;

function isSpecular(r: number, g: number, b: number, luma: number): boolean {
  if (luma < SPECULAR_LUMA_MIN) return false;
  return Math.max(r, g, b) - Math.min(r, g, b) < SPECULAR_SPREAD_MAX;
}

/**
 * Box-filter downsample to a grid x grid array of per-block averages.
 *
 * Specular pixels are excluded from each block's average where possible —
 * a reflection hotspot is noise from the capture, not the card's own color
 * or brightness, and averaging it in drags the whole block toward "blown out
 * white" regardless of what's actually printed there. Falls back to
 * averaging everything if a block is specular end to end, so a block is
 * never left undefined.
 */
function sampleBlocks(source: PixelSource, grid: number): Block[][] {
  const { width: w, height: h, data: px } = source;
  const rows: Block[][] = [];
  for (let by = 0; by < grid; by += 1) {
    const y0 = Math.floor((by * h) / grid);
    const y1 = Math.max(y0 + 1, Math.floor(((by + 1) * h) / grid));
    const row: Block[] = [];
    for (let bx = 0; bx < grid; bx += 1) {
      const x0 = Math.floor((bx * w) / grid);
      const x1 = Math.max(x0 + 1, Math.floor(((bx + 1) * w) / grid));
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let count = 0;
      let allR = 0;
      let allG = 0;
      let allB = 0;
      let allCount = 0;
      for (let y = y0; y < y1 && y < h; y += 1) {
        for (let x = x0; x < x1 && x < w; x += 1) {
          const i = (y * w + x) * 4;
          const pr = px[i];
          const pg = px[i + 1];
          const pb = px[i + 2];
          const pluma = pr * 0.299 + pg * 0.587 + pb * 0.114;
          allR += pr;
          allG += pg;
          allB += pb;
          allCount += 1;
          if (isSpecular(pr, pg, pb, pluma)) continue;
          sr += pr;
          sg += pg;
          sb += pb;
          count += 1;
        }
      }
      const useCount = count || allCount;
      const r = useCount ? (count ? sr : allR) / useCount : 0;
      const g = useCount ? (count ? sg : allG) / useCount : 0;
      const b = useCount ? (count ? sb : allB) / useCount : 0;
      row.push({ r, g, b, luma: r * 0.299 + g * 0.587 + b * 0.114 });
    }
    rows.push(row);
  }
  return rows;
}

class BitWriter {
  private bits = 0n;
  private count = 0;
  push(bit: boolean): void {
    this.bits = (this.bits << 1n) | (bit ? 1n : 0n);
    this.count += 1;
  }
  /** Two bits, MSB first — for the 4-way color-dominance state. */
  push2(value: 0 | 1 | 2 | 3): void {
    this.push((value & 2) !== 0);
    this.push((value & 1) !== 0);
  }
  toHex(): string {
    const hexLength = Math.ceil(this.count / 4);
    return this.bits.toString(16).padStart(hexLength, "0");
  }
  get bitLength(): number {
    return this.count;
  }
}

/** Minimum R/G/B spread to call a block "colored" rather than neutral/gray/gold-white. */
const COLOR_SPREAD_MIN = 18;

/** Which channel dominates a block: 0=neutral, 1=red, 2=green, 3=blue. */
function colorDominance(block: Block): 0 | 1 | 2 | 3 {
  const { r, g, b } = block;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < COLOR_SPREAD_MIN) return 0;
  if (r === max) return 1;
  if (g === max) return 2;
  return 3;
}

export function computeHash(source: PixelSource): string {
  const writer = new BitWriter();

  // Luma blockhash: threshold each included block against the median of only
  // the included blocks, so the excluded band can't skew what "typical" means
  // for the region that actually gets compared.
  const lumaGrid = sampleBlocks(source, GRID_LUMA);
  const lumaIncluded = includedRows(GRID_LUMA);
  const includedLumas: number[] = [];
  for (let row = 0; row < GRID_LUMA; row += 1) {
    if (!lumaIncluded[row]) continue;
    for (const block of lumaGrid[row]) includedLumas.push(block.luma);
  }
  const sortedLumas = [...includedLumas].sort((a, b) => a - b);
  const mid = sortedLumas.length >> 1;
  const median = sortedLumas.length
    ? sortedLumas.length % 2
      ? sortedLumas[mid]
      : (sortedLumas[mid - 1] + sortedLumas[mid]) / 2
    : 0;
  for (let row = 0; row < GRID_LUMA; row += 1) {
    if (!lumaIncluded[row]) continue;
    for (const block of lumaGrid[row]) writer.push(block.luma >= median);
  }

  // Gradient (dHash): each included block vs its right neighbour. Robust to
  // illumination/glare shifting absolute brightness, since it only compares
  // relative brightness between adjacent blocks.
  for (let row = 0; row < GRID_LUMA; row += 1) {
    if (!lumaIncluded[row]) continue;
    const line = lumaGrid[row];
    for (let col = 0; col < GRID_LUMA - 1; col += 1) {
      writer.push(line[col + 1].luma > line[col].luma);
    }
  }

  // Color dominance: coarser grid, 2 bits/block for which channel leads.
  const colorGrid = sampleBlocks(source, GRID_COLOR);
  const colorIncluded = includedRows(GRID_COLOR);
  for (let row = 0; row < GRID_COLOR; row += 1) {
    if (!colorIncluded[row]) continue;
    for (const block of colorGrid[row]) writer.push2(colorDominance(block));
  }

  return writer.toHex();
}

/** Total hash width in bits — fixed (the excluded band is content-independent). */
export const HASH_BITS =
  includedRows(GRID_LUMA).filter(Boolean).length * GRID_LUMA + // luma blockhash
  includedRows(GRID_LUMA).filter(Boolean).length * (GRID_LUMA - 1) + // gradient
  includedRows(GRID_COLOR).filter(Boolean).length * GRID_COLOR * 2; // color, 2 bits/block

export const HASH_HEX_LENGTH = Math.ceil(HASH_BITS / 4);

/** Number of set bits in a BigInt — Kernighan's method, O(popcount). */
function popcount(n: bigint): number {
  let count = 0;
  let x = n;
  while (x > 0n) {
    x &= x - 1n;
    count += 1;
  }
  return count;
}

/** Bits that differ between two hashes of the same width. Lower = more similar. */
export function hammingDistance(a: string, b: string): number {
  return popcount(BigInt(`0x${a}`) ^ BigInt(`0x${b}`));
}
