import { useState, type SyntheticEvent } from "react";
import { artAfterError, cardArtChain, isPlaceholderArt, type CardImageSize } from "./cardImage";

export function useArtChain(chain: readonly (string | null | undefined)[]) {
  const urls = chain.filter((u): u is string => !!u);
  const key = urls.join("|");
  const [state, setState] = useState({ key, failed: 0 });
  const idx = state.key === key ? state.failed : 0;
  const src = urls[idx] ?? null;
  return {
    src,
    fail: () => setState({ key, failed: idx + 1 }),
    onLoad: (e: SyntheticEvent<HTMLImageElement>) => {
      if (isPlaceholderArt(src, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)) {
        setState({ key, failed: idx + 1 });
      }
    },
  };
}

export function useCardArt(
  src: string | undefined | null,
  cardId: string | undefined | null,
  size: CardImageSize,
  origin = "",
) {
  return useArtChain(cardArtChain(src, cardId, size, origin));
}

export function useArtFallback(src: string | null | undefined, defId: string | null | undefined) {
  const after = src && defId ? artAfterError(src, defId) : null;
  return useArtChain([src, after]);
}
