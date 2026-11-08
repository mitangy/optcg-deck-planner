import type { ImgHTMLAttributes, ReactNode } from "react";
import type { CardImageSize } from "./cardImage";
import { useArtFallback, useCardArt } from "./useArtChain";

/**
 * Bare catalog card art `<img>` that walks `cardArtChain` (resized art, original, preview);
 * `fallback` shows once every step failed.
 */
export function CardArtImg({
  src,
  cardId,
  alt = "",
  size = "thumb",
  origin = "",
  fallback = null,
  ...imgProps
}: {
  src?: string | null;
  cardId?: string | null;
  alt?: string;
  size?: CardImageSize;
  /** Where the preview files are hosted (empty = this app). */
  origin?: string;
  fallback?: ReactNode;
} & Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt" | "onError" | "onLoad">) {
  const art = useCardArt(src, cardId, size, origin);
  if (!art.src) return <>{fallback}</>;
  return <img {...imgProps} src={art.src} alt={alt} onError={art.fail} onLoad={art.onLoad} />;
}

/**
 * Card art with the same fallbacks as board tiles: the preview or local mirror when the CDN
 * fails, then `fallback` (the card id as text) instead of a broken image.
 */
export function CardArt({
  src,
  defId,
  className,
  fallback,
  draggable,
}: {
  src: string | null | undefined;
  defId: string;
  className?: string;
  fallback: ReactNode;
  /** Passed to the `<img>`; leave unset for the browser default. */
  draggable?: boolean;
}) {
  const art = useArtFallback(src, defId);
  if (!art.src) return <>{fallback}</>;
  return <img src={art.src} alt="" className={className} draggable={draggable} onLoad={art.onLoad} onError={art.fail} />;
}
