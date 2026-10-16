import { useEffect, useState, type ImgHTMLAttributes, type ReactNode } from "react";
import { cardArtChain, type CardImageSize } from "./cardImage";

/**
 * Walks `cardArtChain` as images fail: `src` is the URL to show now, `fail`
 * moves to the next one, and `src` is null once every step failed.
 */
export function useCardArt(
  src: string | undefined | null,
  cardId: string | undefined | null,
  size: CardImageSize,
) {
  const chain = cardArtChain(src, cardId, size);
  const key = chain.join("|");
  const [state, setState] = useState({ key, failed: 0 });
  const idx = state.key === key ? state.failed : 0;
  return {
    src: chain[idx] ?? null,
    fail: () => setState({ key, failed: idx + 1 }),
  };
}

/** Bare card art `<img>` with the preview fallback; `fallback` shows once every step failed. */
export function CardArtImg({
  src,
  cardId,
  alt = "",
  size = "thumb",
  fallback = null,
  ...imgProps
}: {
  src?: string | null;
  cardId?: string | null;
  alt?: string;
  size?: CardImageSize;
  fallback?: ReactNode;
} & Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt" | "onError">) {
  const art = useCardArt(src, cardId, size);
  if (!art.src) return <>{fallback}</>;
  return <img {...imgProps} src={art.src} alt={alt} onError={art.fail} />;
}

export function CardThumb({
  src,
  cardId,
  alt = "",
}: {
  src?: string;
  cardId?: string | null;
  alt?: string;
}) {
  const [open, setOpen] = useState(false);
  const thumb = useCardArt(src, cardId, "thumb");
  const large = useCardArt(src, cardId, "large");

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function prefetchLarge() {
    if (!large.src) return;
    const img = new Image();
    img.src = large.src;
  }

  if (!thumb.src) return <div className="thumb placeholder" />;

  return (
    <>
      <button
        type="button"
        className="thumb-btn"
        onClick={() => setOpen(true)}
        onPointerEnter={prefetchLarge}
        onFocus={prefetchLarge}
        title="Expand card"
      >
        <img
          src={thumb.src}
          alt={alt}
          className="thumb"
          loading="lazy"
          decoding="async"
          onError={thumb.fail}
        />
      </button>
      {open && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Expanded card art"
          onClick={() => setOpen(false)}
        >
          {large.src && (
            <img
              src={large.src}
              alt={alt}
              className="lightbox-img"
              onClick={(e) => e.stopPropagation()}
              onError={large.fail}
            />
          )}
          <button type="button" className="lightbox-close" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      )}
    </>
  );
}

export function MobileCardMedia({
  src,
  cardId,
  alt,
  cost,
  rarity,
}: {
  src?: string;
  cardId?: string | null;
  alt: string;
  cost: number | string | null;
  rarity?: string;
}) {
  return (
    <div className="mobile-card-media">
      <CardThumb src={src} cardId={cardId} alt={alt} />
      <div className="mobile-card-media-meta">
        <span className="mobile-card-cost">Cost {cost ?? "—"}</span>
        {rarity ? <span className="mobile-card-rarity">{rarity}</span> : null}
      </div>
    </div>
  );
}
