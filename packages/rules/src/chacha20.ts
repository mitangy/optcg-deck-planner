const SIGMA = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574];

export const RNG_KEY_PATTERN = /^[0-9a-f]{64}$/;

function rotl(v: number, n: number): number {
  return (v << n) | (v >>> (32 - n));
}

function quarter(s: Uint32Array, a: number, b: number, c: number, d: number): void {
  s[a] = (s[a]! + s[b]!) | 0; s[d] = rotl(s[d]! ^ s[a]!, 16);
  s[c] = (s[c]! + s[d]!) | 0; s[b] = rotl(s[b]! ^ s[c]!, 12);
  s[a] = (s[a]! + s[b]!) | 0; s[d] = rotl(s[d]! ^ s[a]!, 8);
  s[c] = (s[c]! + s[d]!) | 0; s[b] = rotl(s[b]! ^ s[c]!, 7);
}

/** RFC 8439 block function: 8 key words, a block counter and 3 nonce words (all little-endian) give 16 output words. */
export function chacha20Block(key: ArrayLike<number>, counter: number, nonce: ArrayLike<number>): Uint32Array {
  const init = new Uint32Array(16);
  init.set(SIGMA, 0);
  for (let i = 0; i < 8; i++) init[4 + i] = key[i]!;
  init[12] = counter;
  for (let i = 0; i < 3; i++) init[13 + i] = nonce[i]!;
  const x = Uint32Array.from(init);
  for (let i = 0; i < 10; i++) {
    quarter(x, 0, 4, 8, 12); quarter(x, 1, 5, 9, 13); quarter(x, 2, 6, 10, 14); quarter(x, 3, 7, 11, 15);
    quarter(x, 0, 5, 10, 15); quarter(x, 1, 6, 11, 12); quarter(x, 2, 7, 8, 13); quarter(x, 3, 4, 9, 14);
  }
  for (let i = 0; i < 16; i++) x[i] = (x[i]! + init[i]!) | 0;
  return x;
}

/** 64 hex chars to 8 little-endian words, as the RFC lays a key out in bytes. */
export function keyWords(hex: string): Uint32Array {
  const words = new Uint32Array(8);
  for (let i = 0; i < 8; i++) {
    const b = (j: number) => parseInt(hex.slice(i * 8 + j * 2, i * 8 + j * 2 + 2), 16);
    words[i] = (b(0) | (b(1) << 8) | (b(2) << 16) | (b(3) << 24)) >>> 0;
  }
  return words;
}
