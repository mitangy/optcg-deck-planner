import { describe, expect, it } from "vitest";
import { computeHash, HASH_BITS, HASH_HEX_LENGTH, hammingDistance, type PixelSource } from "./imageHash";

/** Build a synthetic image from a per-pixel color function. */
function image(w: number, h: number, colorAt: (x: number, y: number) => [number, number, number]): PixelSource {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const [r, g, b] = colorAt(x, y);
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

/** A distinctive, non-symmetric pattern so hashing has real structure to key off. */
function checker(w: number, h: number, cell: number, jitter = 0): PixelSource {
  return image(w, h, (x, y) => {
    const on = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
    const base = on ? 220 : 30;
    const v = Math.max(0, Math.min(255, base + jitter));
    // Slight per-channel variation so it isn't pure grayscale, closer to a real photo.
    return [v, Math.max(0, v - 10), Math.min(255, v + 5)];
  });
}

describe("computeHash", () => {
  it("returns a fixed-width hex string matching HASH_BITS", () => {
    const hash = computeHash(checker(64, 64, 8));
    expect(hash).toHaveLength(HASH_HEX_LENGTH);
    expect(hash).toMatch(/^[0-9a-f]+$/);
    expect(HASH_BITS).toBeGreaterThan(0);
    expect(HASH_HEX_LENGTH).toBe(Math.ceil(HASH_BITS / 4));
  });

  it("is deterministic for identical input", () => {
    const a = checker(64, 64, 8);
    expect(computeHash(a)).toBe(computeHash(a));
  });

  it("is stable across resolution changes of the same image", () => {
    // Simulates comparing a rectified phone photo against a differently
    // sized reference product photo of the same card.
    const small = computeHash(checker(80, 112, 10));
    const large = computeHash(checker(630, 880, 79));
    expect(hammingDistance(small, large)).toBeLessThanOrEqual(HASH_BITS * 0.1);
  });

  it("stays close under noise/exposure-like perturbation", () => {
    const clean = computeHash(checker(200, 280, 20, 0));
    const noisy = computeHash(checker(200, 280, 20, 15));
    expect(hammingDistance(clean, noisy)).toBeLessThanOrEqual(HASH_BITS * 0.15);
  });

  it("differs widely from a distinct image", () => {
    const a = computeHash(checker(200, 280, 20));
    // Inverted pattern: every cell's on/off state flips, so blocks that were
    // bright are now dark and vice versa — a genuinely different card.
    const b = computeHash(
      image(200, 280, (x, y) => {
        const on = (Math.floor(x / 20) + Math.floor(y / 20)) % 2 === 0;
        const v = on ? 30 : 220;
        return [v, v, v];
      }),
    );
    expect(hammingDistance(a, b)).toBeGreaterThanOrEqual(HASH_BITS * 0.3);
  });

  it("excludes the watermark band: content there never affects the hash", () => {
    const base = checker(200, 280, 20);
    const withStamp = image(200, 280, (x, y) => {
      const fracY = y / 280;
      if (fracY >= 0.4 && fracY <= 0.62) return [255, 255, 255];
      const on = (Math.floor(x / 20) + Math.floor(y / 20)) % 2 === 0;
      const v = on ? 220 : 30;
      return [v, Math.max(0, v - 10), Math.min(255, v + 5)];
    });
    expect(computeHash(base)).toBe(computeHash(withStamp));
  });

  it("captures color: differently-colored same-pattern images hash apart", () => {
    const red = computeHash(
      image(160, 160, (x, y) => {
        const on = (Math.floor(x / 20) + Math.floor(y / 20)) % 2 === 0;
        return on ? [200, 40, 40] : [40, 40, 40];
      }),
    );
    const blue = computeHash(
      image(160, 160, (x, y) => {
        const on = (Math.floor(x / 20) + Math.floor(y / 20)) % 2 === 0;
        return on ? [40, 40, 200] : [40, 40, 40];
      }),
    );
    expect(hammingDistance(red, blue)).toBeGreaterThan(0);
  });
});

describe("hammingDistance", () => {
  it("is zero for identical hashes", () => {
    expect(hammingDistance("00ff00ff00ff00ff", "00ff00ff00ff00ff")).toBe(0);
  });

  it("counts differing bits", () => {
    expect(hammingDistance("0000000000000000", "0000000000000001")).toBe(1);
    expect(hammingDistance("0000000000000000", "ffffffffffffffff")).toBe(64);
  });
});
