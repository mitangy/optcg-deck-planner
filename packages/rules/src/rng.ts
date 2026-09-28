/** Seeded RNG — no Math.random in the rules engine. */

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, maxExclusive). */
  nextInt(maxExclusive: number): number;
  shuffle<T>(items: T[]): T[];
  snapshot(): RngState;
}

export interface RngState { seed: number; cursor: number }

export function isValidRngState(value: unknown): value is RngState {
  if (!value || typeof value !== "object") return false;
  const { seed, cursor } = value as RngState;
  return Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff && Number.isSafeInteger(cursor) && cursor >= 0;
}

/** Mulberry32 PRNG. */
export function createSeededRng(seedOrState: number | RngState): Rng {
  if (typeof seedOrState !== "number" && !isValidRngState(seedOrState)) throw new Error("Invalid RNG snapshot");
  if (typeof seedOrState === "number" && !Number.isSafeInteger(seedOrState)) throw new Error("RNG seed must be a safe integer");
  const seed = typeof seedOrState === "number" ? seedOrState : seedOrState.seed;
  let cursor = typeof seedOrState === "number" ? 0 : seedOrState.cursor;
  // Mulberry32 advances its uint32 state by a fixed increment per draw.
  // Integer multiplication restores that state without replaying prior draws.
  let t = ((seed >>> 0) + Math.imul(cursor >>> 0, 0x6d2b79f5)) >>> 0;
  const next = (): number => {
    if (cursor === Number.MAX_SAFE_INTEGER) throw new Error("RNG cursor exhausted");
    cursor += 1;
    t = (t + 0x6d2b79f5) >>> 0;
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
    snapshot() { return { seed: seed >>> 0, cursor }; },
  };
}
