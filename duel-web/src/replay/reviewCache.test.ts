import { describe, expect, it } from "vitest";
import { MAX_CACHED_CHARS, MAX_CACHED_REVIEWS, readCachedReview, reviewCacheKey, writeCachedReview } from "./reviewCache";
import type { GameReview } from "./reviewModel";

function memStore() {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}
const counts = { best: 0, great: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
const seat = { counts, graded: 0, unranked: 0, accuracy: null };
const review = (pad = 0): GameReview => ({
  moves: [{ step: 1, seat: 0, turn: 1, played: { intent: { type: "pass" } as never, label: "x".repeat(pad) }, best: { intent: { type: "pass" } as never, label: "b" }, playedWin: 1, bestWin: 2, loss: 1, cls: "good", score: 1, options: 2 }],
  evals: [],
  turns: [],
  seats: [seat, seat],
  forced: 0,
});

describe("review cache", () => {
  it("keys a review by match, rules version and card registry hash, so a rules change shows no stale grades (#967)", () => {
    const base = reviewCacheKey("m1", "1.2", "abc");
    expect(reviewCacheKey("m1", "1.3", "abc")).not.toBe(base);
    expect(reviewCacheKey("m1", "1.2", "abd")).not.toBe(base);
    expect(reviewCacheKey("m2", "1.2", "abc")).not.toBe(base);
    expect(reviewCacheKey("m1", "1.2", "abc")).toBe(base);
  });
  it("reads back what it wrote and ignores a value that is not a review (#967)", () => {
    const s = memStore();
    expect(writeCachedReview("k", review(), s)).toBe(true);
    expect(readCachedReview("k", s)?.moves).toHaveLength(1);
    s.setItem("bad", JSON.stringify({ moves: 3 }));
    expect(readCachedReview("bad", s)).toBeNull();
    s.setItem("junk", "{nope");
    expect(readCachedReview("junk", s)).toBeNull();
    expect(readCachedReview("missing", s)).toBeNull();
  });
  it("does not keep a review that is too large (#967)", () => {
    const s = memStore();
    expect(writeCachedReview("k", review(MAX_CACHED_CHARS), s)).toBe(false);
    expect(s.m.size).toBe(0);
  });
  it("keeps only the newest reviews (#967)", () => {
    const s = memStore();
    for (let i = 0; i <= MAX_CACHED_REVIEWS; i++) writeCachedReview(`k${i}`, review(), s);
    expect(readCachedReview("k0", s)).toBeNull();
    expect(readCachedReview("k1", s)).not.toBeNull();
    expect(readCachedReview(`k${MAX_CACHED_REVIEWS}`, s)).not.toBeNull();
  });
  it("survives storage that throws or is missing (#967)", () => {
    const boom = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); }, removeItem: () => undefined };
    expect(writeCachedReview("k", review(), boom)).toBe(false);
    expect(readCachedReview("k", boom)).toBeNull();
    expect(writeCachedReview("k", review(), null)).toBe(false);
  });
});
