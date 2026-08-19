/** Load and cache the descriptor set the scanner matches against.
 *
 * Deliberately explicit rather than automatic: the bundle is large, and
 * downloading it on page load would cost anyone who only opened the app to
 * check a price. Downloading it lazily on the first scan would be worse —
 * that happens at a vendor booth, on the bad wifi this feature exists to
 * work around. So the user is told the size and asked, ideally while still
 * on home wifi, and after that it is local forever.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  cachedBytes,
  ensureDescriptors,
  type DescriptorManifest,
  type DownloadProgress,
} from "./descriptorCache";
import {
  loadCandidates,
  releaseCandidates,
  type ScanCandidate,
} from "./cardScanMatch";

/**
 * Path prefix every blob is stored under. Owned here rather than folded into
 * the configured URL so both sides agree by construction — it must match
 * PREFIX in scripts/upload-descriptors.mjs.
 */
const SCAN_DATA_PREFIX = "scan-data";

/**
 * Where the chunked descriptor bundle lives.
 *
 * VITE_SCAN_DATA_BASE is the *root* of the store — e.g. a blob storage
 * origin — with the prefix appended here. Empty by default, which resolves
 * to a same-origin `/scan-data`, so a locally generated bundle in public/ is
 * picked up by `npm run dev` with no configuration.
 *
 * Not committed and not served by the API: ~55 MB of descriptors are a build
 * artifact, not source, so keeping them in git would grow the repo
 * permanently for data that is regenerated whenever a set releases. They are
 * immutable by construction — every chunk filename is a hash of its
 * contents — so a CDN can cache them indefinitely.
 */
const SCAN_DATA_ROOT = ((import.meta.env.VITE_SCAN_DATA_BASE as string | undefined) || "").replace(
  /\/+$/,
  "",
);
const SCAN_DATA_BASE = `${SCAN_DATA_ROOT}/${SCAN_DATA_PREFIX}`;
const MANIFEST_URL = `${SCAN_DATA_BASE}/descriptors.manifest.json`;

export type ScanDataState =
  | { kind: "checking" }
  | { kind: "unavailable"; message: string }
  | { kind: "needs-download"; totalBytes: number; cachedBytes: number }
  | { kind: "downloading"; progress: DownloadProgress }
  | { kind: "preparing" }
  | { kind: "ready"; candidates: ScanCandidate[]; totalBytes: number };

export function useScanData(active: boolean) {
  const [state, setState] = useState<ScanDataState>({ kind: "checking" });
  const manifestRef = useRef<DescriptorManifest | null>(null);
  const candidatesRef = useRef<ScanCandidate[] | null>(null);

  // Free the WASM matrices when the scanner closes; they are not garbage
  // collected with the JS objects that reference them.
  useEffect(() => {
    return () => {
      if (candidatesRef.current) {
        void releaseCandidates(candidatesRef.current);
        candidatesRef.current = null;
      }
    };
  }, []);

  const prepare = useCallback(async (manifest: DescriptorManifest) => {
    setState({ kind: "preparing" });
    const candidates = await loadCandidates(manifest);
    candidatesRef.current = candidates;
    setState({ kind: "ready", candidates, totalBytes: manifest.totalBytes });
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(MANIFEST_URL);
        if (!res.ok) throw new Error(`scan data manifest unavailable (HTTP ${res.status})`);
        const manifest: DescriptorManifest = await res.json();
        if (cancelled) return;
        manifestRef.current = manifest;
        const have = await cachedBytes(manifest);
        if (cancelled) return;
        if (have >= manifest.totalBytes) await prepare(manifest);
        else setState({ kind: "needs-download", totalBytes: manifest.totalBytes, cachedBytes: have });
      } catch (err) {
        if (!cancelled) {
          setState({ kind: "unavailable", message: (err as Error).message || "Scan data unavailable." });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, prepare]);

  const download = useCallback(async () => {
    const manifest = manifestRef.current;
    if (!manifest) return;
    try {
      await ensureDescriptors(manifest, SCAN_DATA_BASE, (progress) =>
        setState({ kind: "downloading", progress }),
      );
      await prepare(manifest);
    } catch (err) {
      setState({ kind: "unavailable", message: (err as Error).message || "Download failed." });
    }
  }, [prepare]);

  return { state, download };
}
