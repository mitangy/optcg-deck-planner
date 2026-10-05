import { useState, type ReactNode } from "react";
import { artAfterError, isPlaceholderArt } from "./cardImage";

/**
 * Card art with the same fallbacks as board tiles: the local mirror when the
 * CDN fails, then `fallback` (the card id as text) instead of a broken image.
 */
export function CardArt({
  src,
  defId,
  className,
  fallback,
}: {
  src: string | null | undefined;
  defId: string;
  className?: string;
  fallback: ReactNode;
}) {
  const [failed, setFailed] = useState<{ for: string; next: string | null } | null>(null);
  const current = src ? (failed?.for === src ? failed.next : src) : null;
  if (!current) return <>{fallback}</>;
  return (
    <img
      src={current}
      alt=""
      className={className}
      onLoad={(e) => {
        if (!src || current !== src) return;
        if (isPlaceholderArt(src, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)) {
          setFailed({ for: src, next: artAfterError(src, defId) });
        }
      }}
      onError={() => {
        if (!src) return;
        setFailed({ for: src, next: current === src ? artAfterError(src, defId) : null });
      }}
    />
  );
}
