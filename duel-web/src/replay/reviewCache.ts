/**
 * A finished review kept in IndexedDB per match, so reopening a replay shows it at once (#967). It used to sit in
 * localStorage (up to ~4.8MB of the ~5MB origin quota shared with decks and settings), where it could starve other
 * saves (#1228); IndexedDB has its own, far larger quota.
 * The key carries the rules version and the card registry hash: the review is the bots' opinion under those
 * rules, so a rules change must not show a stale one. Every access is guarded: IndexedDB can be blocked
 * (private mode) or full, and then there is simply no cache.
 */
import { createStore, del, get, set, update, type UseStore } from "idb-keyval";
import type { GameReview } from "./reviewModel";

/** Bump when the review's shape or the way it is made changes. */
export const REVIEW_CACHE_VERSION = 1;
const PREFIX = "optcg-duel:review:";
/** Keys of the kept reviews, oldest first, inside the same IndexedDB store. */
const INDEX_KEY = `${PREFIX}index`;
/** Reviews kept; the oldest go first. */
export const MAX_CACHED_REVIEWS = 12;
/** A review larger than this (characters of JSON) is not kept. */
export const MAX_CACHED_CHARS = 400_000;

export function reviewCacheKey(matchId: string, rulesVersion: string | number, registryHash: string): string {
  return `${PREFIX}v${REVIEW_CACHE_VERSION}:${rulesVersion}:${registryHash}:${matchId}`;
}

type Store = UseStore;

let defaultStoreCache: Store | null | undefined;
function defaultStore(): Store | null {
  if (defaultStoreCache !== undefined) return defaultStoreCache;
  try {
    defaultStoreCache = typeof indexedDB === "undefined" ? null : createStore("optcg-review-cache", "reviews");
  } catch {
    defaultStoreCache = null;
  }
  return defaultStoreCache;
}

/** A parsed value that has the parts of a review the page reads. */
export function looksLikeReview(x: unknown): x is GameReview {
  if (!x || typeof x !== "object") return false;
  const r = x as Partial<GameReview>;
  return (
    Array.isArray(r.moves) &&
    Array.isArray(r.evals) &&
    Array.isArray(r.turns) &&
    Array.isArray(r.seats) &&
    r.seats.length === 2 &&
    r.moves.every((m) => m && typeof m.step === "number" && (m.seat === 0 || m.seat === 1) && m.best?.intent != null)
  );
}

export async function readCachedReview(key: string, store: Store | null = defaultStore()): Promise<GameReview | null> {
  if (!store) return null;
  try {
    const parsed: unknown = await get(key, store);
    return looksLikeReview(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Keeps `review` under `key`. Resolves false when it was not kept (too large, IndexedDB blocked or full). */
export async function writeCachedReview(key: string, review: GameReview, store: Store | null = defaultStore()): Promise<boolean> {
  if (!store) return false;
  try {
    if (JSON.stringify(review).length > MAX_CACHED_CHARS) return false;
    await set(key, review, store);
    let evicted: string[] = [];
    await update<string[]>(
      INDEX_KEY,
      (old) => {
        const index = (Array.isArray(old) ? old : []).filter((k): k is string => typeof k === "string" && k !== key);
        index.push(key);
        evicted = index.splice(0, Math.max(0, index.length - MAX_CACHED_REVIEWS));
        return index;
      },
      store,
    );
    await Promise.all(evicted.map((k) => del(k, store)));
    return true;
  } catch {
    return false;
  }
}

/** Where reviews were kept before #1228. */
type LegacyStorage = Pick<Storage, "length" | "key" | "removeItem">;

function legacyStorage(): LegacyStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

let legacyCleared = false;
/** Deletes the reviews the old localStorage cache left behind, freeing its quota. Nothing is migrated (#1228). */
export function clearLegacyReviewCache(storage: LegacyStorage | null = legacyStorage()): void {
  if (!storage) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    for (const k of keys) storage.removeItem(k);
  } catch {
    /* storage blocked: nothing to free */
  }
}

/** Runs the legacy cleanup once per page load. */
export function clearLegacyReviewCacheOnce(): void {
  if (legacyCleared) return;
  legacyCleared = true;
  clearLegacyReviewCache();
}
