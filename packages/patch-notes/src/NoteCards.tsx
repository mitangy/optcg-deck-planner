import { useState } from "react";
import { CardArtImg } from "@optcg/ui/cardArt";
import { Dialog } from "@optcg/ui/popups";
import type { PatchNoteCard } from "./types";

const COMPACT_SHOWN = 4;

const altOf = (card: PatchNoteCard) => `${card.name}${card.label ? ` (${card.label})` : ""}`;

// Thumbnails have a fixed box, so lazy-loading art never moves the text around them.
export function NoteCards({ cards, cardHref, compact = false }: { cards: readonly PatchNoteCard[]; cardHref?: (id: string) => string; compact?: boolean }) {
  const [open, setOpen] = useState<PatchNoteCard | null>(null);
  const shown = compact ? cards.slice(0, COMPACT_SHOWN) : cards;
  const more = cards.length - shown.length;
  return (
    <>
      <ul className={`wn-cards${compact ? " wn-cards-compact" : ""}`}>
        {shown.map((card) => (
          <li key={`${card.id}-${card.image}`}>
            <button type="button" className="wn-cards-thumb" aria-label={`Enlarge ${altOf(card)}`} onClick={() => setOpen(card)}>
              <CardArtImg src={card.image} cardId={card.id} size="thumb" loading="lazy" alt={altOf(card)} fallback={<span className="wn-cards-missing">{card.id}</span>} />
            </button>
          </li>
        ))}
        {more > 0 ? (
          <li className="wn-cards-more" aria-label={`${more} more cards`}>
            +{more}
          </li>
        ) : null}
      </ul>
      <Dialog open={open !== null} onClose={() => setOpen(null)} label={open?.name} className="wn-zoom" panelClassName="wn-zoom-panel">
        {open ? (
          <>
            <div className="wn-zoom-art">
              <CardArtImg className="wn-zoom-img" src={open.image} cardId={open.id} size="large" alt={altOf(open)} fallback={<span className="wn-cards-missing">Picture not available yet</span>} />
            </div>
            <p className="wn-zoom-caption">{[open.name, open.id, open.label].filter(Boolean).join(" · ")}</p>
            <div className="wn-zoom-actions">
              {cardHref ? (
                <a className="wn-zoom-link" href={cardHref(open.id)}>
                  Open card page
                </a>
              ) : null}
              <button type="button" className="wn-zoom-close" onClick={() => setOpen(null)}>
                Close
              </button>
            </div>
          </>
        ) : null}
      </Dialog>
    </>
  );
}
