import type { ImgHTMLAttributes, ReactNode } from "react";
import type { CardImageSize } from "./cardImage";
import { useArtFallback, useCardArt } from "./useArtChain";

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
  origin?: string;
  fallback?: ReactNode;
} & Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt" | "onError" | "onLoad">) {
  const art = useCardArt(src, cardId, size, origin);
  if (!art.src) return <>{fallback}</>;
  return <img {...imgProps} src={art.src} alt={alt} onError={art.fail} onLoad={art.onLoad} />;
}

export function CardArt({
  src,
  defId,
  className,
  fallback,
  draggable,
  loading,
}: {
  src: string | null | undefined;
  defId: string;
  className?: string;
  fallback: ReactNode;
  draggable?: boolean;
  loading?: "lazy";
}) {
  const art = useArtFallback(src, defId);
  if (!art.src) return <>{fallback}</>;
  return (
    <img
      src={art.src}
      alt=""
      className={className}
      draggable={draggable}
      loading={loading}
      decoding={loading === "lazy" ? "async" : undefined}
      onLoad={art.onLoad}
      onError={art.fail}
    />
  );
}
