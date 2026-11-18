import { createContext, useContext, useState, type ComponentProps, type ReactNode } from "react";
import { CardArtImg as SharedCardArtImg, useCardArt as useSharedCardArt, type CardImageSize } from "@optcg/ui/cardArt";
import { CardStack } from "@optcg/ui/cardStack";
import { Dialog } from "@optcg/ui/popups";
import { DUEL_URL } from "../app/duelLink";
import { useLogPoseLayer } from "@optcg/analyst-client";

export function useCardArt(
  src: string | undefined | null,
  cardId: string | undefined | null,
  size: CardImageSize,
) {
  return useSharedCardArt(src, cardId, size, DUEL_URL);
}

export function CardArtImg(props: Omit<ComponentProps<typeof SharedCardArtImg>, "origin">) {
  return <SharedCardArtImg {...props} origin={DUEL_URL} />;
}

export const CardLightboxActionContext = createContext<((cardId: string, productId?: number, close?: () => void) => ReactNode) | null>(null);

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
