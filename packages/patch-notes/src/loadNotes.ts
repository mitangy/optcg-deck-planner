import { useEffect, useState } from "react";
import type { PatchNote } from "./types";

let inflight: Promise<PatchNote[]> | null = null;

/**
 * The full notes list, fetched on first use as its own chunk (~90 KB of text) so neither app's entry
 * bundle carries it. Nothing outside this file may import `./notes` statically, or the split is lost.
 */
export function loadPatchNotes(): Promise<PatchNote[]> {
  inflight ??= import("./notes")
    .then((m) => m.PATCH_NOTES)
    .catch((err) => {
      inflight = null; // a failed chunk fetch (offline, mid-deploy) can be retried
      throw err;
    });
  return inflight;
}

/** The notes once loaded, or null while the chunk downloads (or if it could not be fetched). */
export function usePatchNotes(): PatchNote[] | null {
  const [notes, setNotes] = useState<PatchNote[] | null>(null);
  useEffect(() => {
    let live = true;
    loadPatchNotes().then(
      (n) => {
        if (live) setNotes(n);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, []);
  return notes;
}
