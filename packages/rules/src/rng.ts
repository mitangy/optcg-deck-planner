import { RNG_KEY_PATTERN, chacha20Block, keyWords } from "./chacha20.js";

export interface Rng {
  next(): number;
  nextInt(maxExclusive: number): number;
  shuffle<T>(items: T[]): T[];
  snapshot(): RngState;
}

/** With `key` (64 hex chars) draws come from a ChaCha20 stream, `seed` only names the stream and `cursor` counts 32-bit words drawn. */
export interface RngState { seed: number; cursor: number; key?: string }

export function isValidRngState(value: unknown): value is RngState {
  if (!value || typeof value !== "object") return false;
  const { seed, cursor, key } = value as RngState;
  if (key !== undefined && (typeof key !== "string" || !RNG_KEY_PATTERN.test(key))) return false;
  return Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff && Number.isSafeInteger(cursor) && cursor >= 0;
}

function makeRng(next: () => number, snapshot: () => RngState): Rng {
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
        [arr[i], arr[j]] = [arr[j]!, arr[i]!];
      }
      return arr;
    },
    snapshot,
  };
}

/** `purpose` separates independent streams that share one key (0 is the match's main stream). */
export function createKeyedRng(key: string, seed: number, cursor = 0, purpose = 0): Rng {
  if (!isValidRngState({ seed, cursor, key })) throw new Error("Invalid RNG snapshot");
  const words = keyWords(key);
  const nonce = [purpose >>> 0, seed >>> 0, 0];
  let block: Uint32Array | null = null;
  let blockIndex = -1;
  const next = (): number => {
    if (cursor >= Number.MAX_SAFE_INTEGER) throw new Error("RNG cursor exhausted");
    const index = Math.floor(cursor / 16);
    if (index !== blockIndex) {
      if (index > 0xffffffff) throw new Error("RNG cursor exhausted");
      block = chacha20Block(words, index, nonce);
      blockIndex = index;
    }
    const word = block![cursor % 16]!;
    cursor += 1;
    return word / 4294967296;
  };
  return makeRng(next, () => ({ seed: seed >>> 0, cursor, key }));
}

export function createSeededRng(seedOrState: number | RngState): Rng {
  if (typeof seedOrState !== "number" && !isValidRngState(seedOrState)) throw new Error("Invalid RNG snapshot");
  if (typeof seedOrState === "number" && !Number.isSafeInteger(seedOrState)) throw new Error("RNG seed must be a safe integer");
  if (typeof seedOrState !== "number" && seedOrState.key !== undefined) return createKeyedRng(seedOrState.key, seedOrState.seed, seedOrState.cursor);
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
  return makeRng(next, () => ({ seed: seed >>> 0, cursor }));
}
