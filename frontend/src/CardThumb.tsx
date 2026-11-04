import { createContext, useContext, useState, type ImgHTMLAttributes, type ReactNode } from "react";
import { cardArtChain, type CardImageSize } from "@optcg/ui/cardArt";
import { Dialog } from "@optcg/ui/popups";
import { DUEL_URL } from "./duelLink";

/**
 * Walks `cardArtChain` as images fail: `src` is the URL to show now, `fail`
 * moves to the next one, and `src` is null once every step failed.
 */
export function useCardArt(
  src: string | undefined | null,
  cardId: string | undefined | null,
  size: CardImageSize,
) {
  const chain = cardArtChain(src, cardId, size, DUEL_URL);
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

/**
 * Lets the app shell put an action (e.g. "Add to shopping list") under the enlarged
 * card. Null where there is none, such as public pages, so those lightboxes stay plain.
 * `productId` is the printing the tile shows (0 = base art); undefined where the thumb is not
 * tied to one art. `close` closes the lightbox, for actions that open something else (Log Pose).
 */
export const CardLightboxActionContext = createContext<((cardId: string, productId?: number, close?: () => void) => ReactNode) | null>(null);

export function CardThumb({
  src,
  cardId,
  alt = "",
  productId,
}: {
  src?: string;
  cardId?: string | null;
  alt?: string;
  /** Which art this thumb shows (0 = base), handed to the lightbox action. */
  productId?: number;
}) {
  const [open, setOpen] = useState(false);
  const renderAction = useContext(CardLightboxActionContext);
  const thumb = useCardArt(src, cardId, "thumb");
  const large = useCardArt(src, cardId, "large");

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
      {open ? (
        <Dialog
          open
          onClose={() => setOpen(false)}
          className="lightbox"
          panelClassName="lightbox-panel"
          label="Expanded card art"
        >
          {large.src && (
            <img src={large.src} alt={alt} className="lightbox-img" onError={large.fail} />
          )}
          {cardId && renderAction ? <div className="lightbox-action">{renderAction(cardId, productId, () => setOpen(false))}</div> : null}
          <button type="button" className="lightbox-close" onClick={() => setOpen(false)}>
            Close
          </button>
        </Dialog>
      ) : null}
    </>
  );
}

export function MobileCardMedia({
  src,
  productId,
  cardId,
  alt,
  cost,
  rarity,
}: {
  src?: string;
  productId?: number;
  cardId?: string | null;
  alt: string;
  cost: number | string | null;
  rarity?: string;
}) {
  return (
    <div className="mobile-card-media">
      <CardThumb src={src} cardId={cardId} alt={alt} productId={productId} />
      <div className="mobile-card-media-meta">
        <span className="mobile-card-cost">Cost {cost ?? "—"}</span>
        {rarity ? <span className="mobile-card-rarity">{rarity}</span> : null}
      </div>
    </div>
  );
}
