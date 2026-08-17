import { useEffect, useState } from "react";
import { cardImageUrl } from "./cardImage";

export function CardThumb({ src, alt = "" }: { src?: string; alt?: string }) {
  const [open, setOpen] = useState(false);
  const thumbSrc = cardImageUrl(src, "thumb");
  const largeSrc = cardImageUrl(src, "large");

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function prefetchLarge() {
    if (!largeSrc) return;
    const img = new Image();
    img.src = largeSrc;
  }

  if (!src) return <div className="thumb placeholder" />;

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
          src={thumbSrc}
          alt={alt}
          className="thumb"
          loading="lazy"
          decoding="async"
          onError={(e) => {
            if (src && e.currentTarget.src !== src) e.currentTarget.src = src;
          }}
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
          <img
            src={largeSrc}
            alt={alt}
            className="lightbox-img"
            onClick={(e) => e.stopPropagation()}
            onError={(e) => {
              if (src && e.currentTarget.src !== src) e.currentTarget.src = src;
            }}
          />
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
  alt,
  cost,
  rarity,
}: {
  src?: string;
  alt: string;
  cost: number | string | null;
  rarity?: string;
}) {
  return (
    <div className="mobile-card-media">
      <CardThumb src={src} alt={alt} />
      <div className="mobile-card-media-meta">
        <span className="mobile-card-cost">Cost {cost ?? "—"}</span>
        {rarity ? <span className="mobile-card-rarity">{rarity}</span> : null}
      </div>
    </div>
  );
}
