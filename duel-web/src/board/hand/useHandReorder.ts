import { useCallback, useEffect, useRef, useState } from "react";
import { followHandDrag, handDropSlot, type SlotRect } from "./handOrder";

export type HandReorder = {
  cardId: string;
  inZone: boolean;
  slot: number | null;
};

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

// Tilted fan cards poke out of the row, so the area is the row plus the cards, clipped to the panel; measured live so a tucked hand counts only its visible strip.
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

export function useHandReorder(
  onReorder: (cardId: string, slot: number, x: number, y: number) => void,
  { oneWayOut = false }: { oneWayOut?: boolean } = {},
) {
  const [state, setState] = useState<HandReorder | null>(null);
  const cardIdRef = useRef<string | null>(null);
  const leftRef = useRef(false);
  const oneWayOutRef = useRef(oneWayOut);
  oneWayOutRef.current = oneWayOut;
  const follow = useCallback((cardId: string, x: number, y: number) => {
    const next = followHandDrag(leftRef.current, measureSlot(cardId, x, y), oneWayOutRef.current);
    leftRef.current = next.left;
    return next.slot;
  }, []);

  const active = state != null;
  useEffect(() => {
    if (!active) return;
    const onMove = (e: PointerEvent) => {
      const cardId = cardIdRef.current;
      if (!cardId) return;
      const slot = follow(cardId, e.clientX, e.clientY);
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
  }, [active, follow]);

  const begin = useCallback((cardId: string) => {
    cardIdRef.current = cardId;
    leftRef.current = false;
    setState({ cardId, inZone: true, slot: null });
  }, []);

  const end = useCallback(
    (x: number, y: number, move = true) => {
      const cardId = cardIdRef.current;
      cardIdRef.current = null;
      setState(null);
      if (!cardId) return false;
      const slot = follow(cardId, x, y);
      if (slot == null) return false;
      if (move) onReorder(cardId, slot, x, y);
      return true;
    },
    [onReorder, follow],
  );

  const cancel = useCallback(() => {
    cardIdRef.current = null;
    setState(null);
  }, []);

  return { reorder: state, begin, end, cancel };
}
