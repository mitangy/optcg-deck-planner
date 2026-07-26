import { useEffect, useState } from "react";

export function CardThumb({ src, alt = "" }: { src?: string; alt?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!src) return <div className="thumb placeholder" />;

  return (
    <>
      <button type="button" className="thumb-btn" onClick={() => setOpen(true)} title="Expand card">
        <img src={src} alt={alt} className="thumb" loading="lazy" />
      </button>
      {open && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Expanded card art"
          onClick={() => setOpen(false)}
        >
          <img src={src} alt={alt} className="lightbox-img" onClick={(e) => e.stopPropagation()} />
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
