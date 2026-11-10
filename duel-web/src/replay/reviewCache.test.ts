import "fake-indexeddb/auto";
import { createStore, get, set } from "idb-keyval";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_CACHED_CHARS, MAX_CACHED_REVIEWS, clearLegacyReviewCache, readCachedReview, reviewCacheKey, writeCachedReview } from "./reviewCache";
import type { GameReview } from "./reviewModel";

let n = 0;
/** A fresh IndexedDB store per test (fake-indexeddb), so tests share nothing. */
const freshStore = () => createStore(`review-cache-test-${n++}`, "reviews");
function memStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return { m, get length() { return m.size; }, key: (i: number) => [...m.keys()][i] ?? null, removeItem: (k: string) => void m.delete(k) };
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
  it("reads back what it wrote and ignores a value that is not a review (#967)", async () => {
    const s = freshStore();
    expect(await writeCachedReview("k", review(), s)).toBe(true);
    expect((await readCachedReview("k", s))?.moves).toHaveLength(1);
    await set("bad", { moves: 3 }, s);
    expect(await readCachedReview("bad", s)).toBeNull();
    await set("junk", "{nope", s);
    expect(await readCachedReview("junk", s)).toBeNull();
    expect(await readCachedReview("missing", s)).toBeNull();
  });
  it("does not keep a review that is too large (#967)", async () => {
    const s = freshStore();
    expect(await writeCachedReview("k", review(MAX_CACHED_CHARS), s)).toBe(false);
    expect(await get("k", s)).toBeUndefined();
  });
  it("keeps only the newest reviews and deletes the evicted one (#967, #1228)", async () => {
    const s = freshStore();
    for (let i = 0; i <= MAX_CACHED_REVIEWS; i++) await writeCachedReview(`k${i}`, review(), s);
    expect(await readCachedReview("k0", s)).toBeNull();
    expect(await get("k0", s)).toBeUndefined();
    expect(await readCachedReview("k1", s)).not.toBeNull();
    expect(await readCachedReview(`k${MAX_CACHED_REVIEWS}`, s)).not.toBeNull();
  });
  it("counts a review saved again as the newest, not as a second entry (#1228)", async () => {
    const s = freshStore();
    for (let i = 0; i < MAX_CACHED_REVIEWS; i++) await writeCachedReview(`k${i}`, review(), s);
    await writeCachedReview("k0", review(), s);
    await writeCachedReview("new", review(), s);
    expect(await readCachedReview("k0", s)).not.toBeNull();
    expect(await readCachedReview("k1", s)).toBeNull();
  });
  it("falls back to no cache when IndexedDB is missing or fails (#967, #1228)", async () => {
    expect(await writeCachedReview("k", review(), null)).toBe(false);
    expect(await readCachedReview("k", null)).toBeNull();
    const broken = (() => Promise.reject(new Error("blocked"))) as never;
    expect(await writeCachedReview("k", review(), broken)).toBe(false);
    expect(await readCachedReview("k", broken)).toBeNull();
  });
});

describe("review cache and localStorage (#1228)", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("saving a review writes nothing to localStorage (#1228)", async () => {
    const ls = { setItem: vi.fn(), getItem: vi.fn(() => null), removeItem: vi.fn(), length: 0, key: () => null };
    vi.stubGlobal("localStorage", ls);
    expect(await writeCachedReview(reviewCacheKey("m1", "1", "h"), review())).toBe(true);
    expect(ls.setItem).not.toHaveBeenCalled();
    expect((await readCachedReview(reviewCacheKey("m1", "1", "h")))?.moves).toHaveLength(1);
  });
  it("removes the old localStorage reviews and their index, and nothing else (#1228)", () => {
    const old = reviewCacheKey("m1", "1", "h");
    const ls = memStorage({ [old]: "{}", "optcg-duel:review:index": "[]", "optcg-duel:decks": "[]", other: "x" });
    clearLegacyReviewCache(ls);
    expect([...ls.m.keys()].sort()).toEqual(["optcg-duel:decks", "other"]);
  });
});
