/** Match a scanned card against the catalog by perceptual hash.
 *
 * The manifest (every hashed printing's {product_id, card_id, phash}) is
 * fetched once and kept in memory for the session — the endpoint is ETag'd,
 * so the browser's own HTTP cache handles "unchanged, don't re-download"
 * without any bespoke invalidation logic here.
 */

import { api } from "./api";
import type { CatalogHashManifest, CatalogPrintingHash } from "./api";
import { hammingDistance } from "./imageHash";

export type HashMatch = {
  printing: CatalogPrintingHash;
  distance: number;
  /** The next-closest printing, and its distance — the gap between the two
   *  is the real confidence signal: a wide gap means an unambiguous match. */
  runnerUp: { printing: CatalogPrintingHash; distance: number } | null;
};

let manifestPromise: Promise<CatalogHashManifest> | null = null;

/** Get the shared hash manifest, fetching it on first use. */
export async function getHashManifest(): Promise<CatalogHashManifest> {
  if (!manifestPromise) {
    manifestPromise = api.hashManifest().catch((err) => {
      // Let a later attempt retry rather than caching the failure forever.
      manifestPromise = null;
      throw err;
    });
  }
  return manifestPromise;
}

/** True once the manifest has been fetched (or is in flight) this session. */
export function isHashManifestLoaded(): boolean {
  return manifestPromise !== null;
}

/**
 * Find the closest printing(s) to a scanned hash.
 *
 * A linear scan over a few thousand 64-bit hashes (XOR + popcount each) is
 * sub-millisecond — no index structure is warranted at catalog scale.
 */
export function findBestMatch(hash: string, manifest: CatalogHashManifest): HashMatch | null {
  let best: CatalogPrintingHash | null = null;
  let bestDistance = Infinity;
  let runnerUp: CatalogPrintingHash | null = null;
  let runnerUpDistance = Infinity;

  for (const printing of manifest.printings) {
    const distance = hammingDistance(hash, printing.phash);
    if (distance < bestDistance) {
      runnerUp = best;
      runnerUpDistance = bestDistance;
      best = printing;
      bestDistance = distance;
    } else if (distance < runnerUpDistance) {
      runnerUp = printing;
      runnerUpDistance = distance;
    }
  }

  if (!best) return null;
  return {
    printing: best,
    distance: bestDistance,
    runnerUp: runnerUp ? { printing: runnerUp, distance: runnerUpDistance } : null,
  };
}

/** Fetch the manifest (if needed) and match in one call. */
export async function matchScannedHash(hash: string): Promise<HashMatch | null> {
  const manifest = await getHashManifest();
  return findBestMatch(hash, manifest);
}
