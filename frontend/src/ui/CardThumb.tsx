import { createContext, useContext, useState, type ComponentProps, type ReactNode } from "react";
import { CardArtImg as SharedCardArtImg, useCardArt as useSharedCardArt, type CardImageSize } from "@optcg/ui/cardArt";
import { CardStack } from "@optcg/ui/cardStack";
import { Dialog } from "@optcg/ui/popups";
import { DUEL_URL } from "../app/duelLink";
import { useLogPoseLayer } from "@optcg/analyst-client";

/** The planner's art: preview files are hosted by the duel app (`DUEL_URL`). */
export function useCardArt(
  src: string | undefined | null,
  cardId: string | undefined | null,
  size: CardImageSize,
) {
  return useSharedCardArt(src, cardId, size, DUEL_URL);
}

/** Bare card art `<img>` with the preview fallback; `fallback` shows once every step failed. */
export function CardArtImg(props: Omit<ComponentProps<typeof SharedCardArtImg>, "origin">) {
  return <SharedCardArtImg {...props} origin={DUEL_URL} />;
}

/**
 * Lets the app shell put an action (e.g. "Add to shopping list") under the enlarged
 * card. Null where there is none, such as public pages, so those lightboxes stay plain.
 * `productId` is the printing the tile shows (0 = base art); undefined where the thumb is not
 * tied to one art. `close` closes the lightbox, for actions that open something else (Log Pose).
 */
export const CardLightboxActionContext = createContext<((cardId: string, productId?: number, close?: () => void) => ReactNode) | null>(null);

/** The enlarged card: big art, optional `children` (actions) under it, and a Close button. */
export function CardLightbox({
  src,
  cardId,
  alt = "",
  onClose,
  children,
}: {
  src?: string | null;
  cardId?: string | null;
  alt?: string;
  onClose: () => void;
  children?: ReactNode;
}) {
  const large = useCardArt(src, cardId, "large");
  // Log Pose opens inside the card (not behind it), so the chat and the card are both usable.
  const [chatLayer, setChatLayer] = useState<HTMLElement | null>(null);
  useLogPoseLayer(chatLayer);
  return (
    <Dialog open onClose={onClose} className="lightbox" panelClassName="lightbox-panel" label="Expanded card art">
      {large.src && <img src={large.src} alt={alt} className="lightbox-img" onError={large.fail} onLoad={large.onLoad} />}
      {children}
      <div ref={setChatLayer} className="lightbox-chat-layer" />
      <button type="button" className="lightbox-close" onClick={onClose}>
        Close
      </button>
    </Dialog>
  );
}

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
          onLoad={thumb.onLoad}
        />
      </button>
      {open ? (
        <CardLightbox src={src} cardId={cardId} alt={alt} onClose={() => setOpen(false)}>
          {cardId && renderAction ? <div className="lightbox-action">{renderAction(cardId, productId, () => setOpen(false))}</div> : null}
        </CardLightbox>
      ) : null}
    </>
  );
}

/**
 * A thumb that, given `copies`, is drawn as a pile of that many cards (up to four) with the
 * space always reserved, so a row of tiles stays aligned. Without `copies` it is a plain thumb.
 * The layers are lazy plain images; only the front card is clickable.
 */
export function StackedThumb({
  copies,
  src,
  cardId,
  alt = "",
  productId,
}: {
  copies?: number;
  src?: string;
  cardId?: string | null;
  alt?: string;
  productId?: number;
}) {
  const thumb = <CardThumb src={src} cardId={cardId} alt={alt} productId={productId} />;
  if (copies == null) return thumb;
  return (
    <CardStack
      className="deck-copies"
      count={copies}
      reserve
      copy={<CardArtImg src={src} cardId={cardId} size="thumb" loading="lazy" decoding="async" />}
    >
      {thumb}
    </CardStack>
  );
}

export function MobileCardMedia({
  src,
  productId,
  cardId,
  alt,
  cost,
  rarity,
  copies,
}: {
  src?: string;
  productId?: number;
  cardId?: string | null;
  alt: string;
  cost: number | string | null;
  rarity?: string;
  /** Deck page: copies in the deck, drawn as a stack. */
  copies?: number;
}) {
  return (
    <div className="mobile-card-media">
      <StackedThumb copies={copies} src={src} cardId={cardId} alt={alt} productId={productId} />
      <div className="mobile-card-media-meta">
        <span className="mobile-card-cost">Cost {cost ?? "—"}</span>
        {rarity ? <span className="mobile-card-rarity">{rarity}</span> : null}
      </div>
    </div>
  );
}
