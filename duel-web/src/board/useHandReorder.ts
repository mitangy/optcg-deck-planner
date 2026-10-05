import { useCallback, useEffect, useRef, useState } from "react";
import { handDropSlot, type SlotRect } from "./handOrder";

/** A hand card being dragged while the hand can be reordered. */
export type HandReorder = {
  cardId: string;
  /** Pointer is over the hand: a drop here reorders (and the hand stays up). */
  inZone: boolean;
  /** Where it would land, counted among the other cards (only while inZone). */
  slot: number | null;
};

/** Unrotated rect centred where the card is drawn (fanned cards are tilted). */
function cardRect(el: HTMLElement): SlotRect {
  const r = el.getBoundingClientRect();
  const w = el.offsetWidth || r.width;
  const h = el.offsetHeight || r.height;
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  return {
    left: cx - w / 2,
    right: cx + w / 2,
    top: cy - h / 2,
    bottom: cy + h / 2,
  };
}

/**
 * Over the hand → the drop slot among the other cards; elsewhere → null.
 * The hand area is the cards' row plus the cards themselves (tilted fan
 * cards poke out of it), clipped to the hand's panel so a scrolled row
 * doesn't reach past what is on screen. It is measured live, so a tucked
 * hand only counts its visible strip.
 */
function measureSlot(cardId: string, x: number, y: number): number | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector<HTMLElement>(`[data-motion-id="${CSS.escape(cardId)}"]`);
  const row = el?.parentElement;
  if (!el || !row) return null;
  const cards = Array.from(row.children).filter(
    (c): c is HTMLElement => c instanceof HTMLElement && c.dataset.motionId != null,
  );
  let { left, right, top, bottom } = row.getBoundingClientRect();
  for (const c of cards) {
    const r = c.getBoundingClientRect();
    left = Math.min(left, r.left);
    right = Math.max(right, r.right);
    top = Math.min(top, r.top);
    bottom = Math.max(bottom, r.bottom);
  }
  const panel = row.parentElement?.getBoundingClientRect();
  if (panel) {
    left = Math.max(left, panel.left);
    right = Math.min(right, panel.right);
    top = Math.max(top, panel.top);
    bottom = Math.min(bottom, panel.bottom);
  }
  if (x < left || x > right || y < top || y > bottom) return null;
  return handDropSlot(cards.filter((c) => c !== el).map(cardRect), x, y);
}

/**
 * Pointer tracking for dragging a hand card to a new spot in the hand. The
 * card's own drag (CardTile) says when it starts and ends; this follows the
 * pointer in between to say whether it is over the hand and where it lands.
 */
export function useHandReorder(onReorder: (cardId: string, slot: number) => void) {
  const [state, setState] = useState<HandReorder | null>(null);
  const cardIdRef = useRef<string | null>(null);

  const active = state != null;
  useEffect(() => {
    if (!active) return;
    const onMove = (e: PointerEvent) => {
      const cardId = cardIdRef.current;
      if (!cardId) return;
      const slot = measureSlot(cardId, e.clientX, e.clientY);
      setState((cur) =>
        cur && (cur.slot !== slot || cur.inZone !== (slot != null))
          ? { cardId, inZone: slot != null, slot }
          : cur,
      );
    };
    window.addEventListener("pointermove", onMove, {
      capture: true,
      passive: true,
    });
    return () => window.removeEventListener("pointermove", onMove, { capture: true });
  }, [active]);

  const begin = useCallback((cardId: string) => {
    cardIdRef.current = cardId;
    // The drag starts on the card, so it starts over the hand.
    setState({ cardId, inZone: true, slot: null });
  }, []);

  /** Drop at (x, y): true when it landed on the hand (and was reordered). */
  const end = useCallback(
    (x: number, y: number) => {
      const cardId = cardIdRef.current;
      cardIdRef.current = null;
      setState(null);
      if (!cardId) return false;
      const slot = measureSlot(cardId, x, y);
      if (slot == null) return false;
      onReorder(cardId, slot);
      return true;
    },
    [onReorder],
  );

  const cancel = useCallback(() => {
    cardIdRef.current = null;
    setState(null);
  }, []);

  return { reorder: state, begin, end, cancel };
}
