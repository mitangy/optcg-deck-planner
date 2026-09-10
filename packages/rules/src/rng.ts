/** Seeded RNG — no Math.random in the rules engine. */

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, maxExclusive). */
  nextInt(maxExclusive: number): number;
  shuffle<T>(items: T[]): T[];
}

/** Mulberry32 PRNG. */
export function createSeededRng(seed: number): Rng {
  let t = seed >>> 0;
  const next = (): number => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    nextInt(maxExclusive: number) {
      if (maxExclusive <= 0) return 0;
      return Math.floor(next() * maxExclusive);
    },
    shuffle<T>(items: T[]): T[] {
      const arr = items.slice();
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
}
