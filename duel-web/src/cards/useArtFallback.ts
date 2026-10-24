import { useState } from "react";
import { artAfterError } from "@optcg/ui/cardArt";

/**
 * Card art with the `artAfterError` chain (TCGplayer, then preview / local
 * mirror, then nothing) for an `<img>` that has no chain of its own.
 * `src` is null once every step failed: show the text fallback.
 */
export function useArtFallback(src: string | null | undefined, defId: string | null | undefined) {
  const [failed, setFailed] = useState<{ for: string; next: string | null } | null>(null);
  const current = src ? (failed?.for === src ? failed.next : src) : null;
  const fail = () => {
    if (!src) return;
    setFailed({ for: src, next: current === src && defId ? artAfterError(src, defId) : null });
  };
  return { src: current, fail };
}
