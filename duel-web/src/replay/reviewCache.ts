/**
 * A finished review kept in localStorage per match, so reopening a replay shows it at once (#967).
 * The key carries the rules version and the card registry hash: the review is the bots' opinion under those
 * rules, so a rules change must not show a stale one. Every access is guarded: storage can be blocked or full.
 */
import type { GameReview } from "./reviewModel";

/** Bump when the review's shape or the way it is made changes. */
export const REVIEW_CACHE_VERSION = 1;
const PREFIX = "optcg-duel:review:";
const INDEX_KEY = `${PREFIX}index`;
/** Reviews kept; the oldest go first. */
export const MAX_CACHED_REVIEWS = 12;
/** A review larger than this (characters of JSON) is not kept. */
export const MAX_CACHED_CHARS = 400_000;

export function reviewCacheKey(matchId: string, rulesVersion: string | number, registryHash: string): string {
  return `${PREFIX}v${REVIEW_CACHE_VERSION}:${rulesVersion}:${registryHash}:${matchId}`;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStore(): Store | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
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

export function readCachedReview(key: string, store: Store | null = defaultStore()): GameReview | null {
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return looksLikeReview(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Keeps `review` under `key`. Returns false when it was not kept (too large, storage blocked or full). */
export function writeCachedReview(key: string, review: GameReview, store: Store | null = defaultStore()): boolean {
  if (!store) return false;
  try {
    const raw = JSON.stringify(review);
    if (raw.length > MAX_CACHED_CHARS) return false;
    let index: string[] = [];
    try {
      const parsed: unknown = JSON.parse(store.getItem(INDEX_KEY) ?? "[]");
      if (Array.isArray(parsed)) index = parsed.filter((k): k is string => typeof k === "string");
    } catch {
      /* a broken index starts over */
    }
    index = index.filter((k) => k !== key);
    index.push(key);
    while (index.length > MAX_CACHED_REVIEWS) store.removeItem(index.shift()!);
    store.setItem(key, raw);
    store.setItem(INDEX_KEY, JSON.stringify(index));
    return true;
  } catch {
    return false;
  }
}
