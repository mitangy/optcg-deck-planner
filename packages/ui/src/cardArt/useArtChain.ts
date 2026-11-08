import { useState, type SyntheticEvent } from "react";
import { artAfterError, cardArtChain, isPlaceholderArt, type CardImageSize } from "./cardImage";

/**
 * Walks an ordered list of image URLs as they fail: `src` is the one to show now, `fail` moves to
 * the next (the `onError` handler), and `src` is null once every step failed. `onLoad` skips a
 * TCGplayer "Image Coming Soon" placeholder, which loads fine (HTTP 200) so `onError` never fires.
 * A different list starts over from its first URL.
 */
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

/**
 * The art for a catalog card: the resized TCGplayer URL, the original, then the preview image
 * (see `cardArtChain`). `origin` is where the preview files are hosted (the planner uses the duel app's).
 */
export function useCardArt(
  src: string | undefined | null,
  cardId: string | undefined | null,
  size: CardImageSize,
  origin = "",
) {
  return useArtChain(cardArtChain(src, cardId, size, origin));
}

/**
 * Art for an `<img>` that already has its URL (a board tile, a deck row): `src`, then what
 * `artAfterError` offers (preview art / the local mirror), then nothing. `src` is null once every
 * step failed: show the text fallback.
 */
export function useArtFallback(src: string | null | undefined, defId: string | null | undefined) {
  const after = src && defId ? artAfterError(src, defId) : null;
  return useArtChain([src, after]);
}
