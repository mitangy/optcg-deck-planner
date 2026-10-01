import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

/**
 * Where a deck can be dropped on the Decks page (`data-deck-drop` on the section).
 * Import is one way: planner decks drop only into Your decks; removing a copy is Delete.
 */
export type DeckDropZone = "local";

/** Planner decks being dragged into Your decks (one deck, or the ticked group). */
export type DeckDragItem = { kind: "planner"; ids: number[]; label: string };

export type DeckDragState = { item: DeckDragItem; x: number; y: number; over: DeckDropZone | null };

function zoneAt(x: number, y: number): DeckDropZone | null {
  const el = document.elementFromPoint(x, y)?.closest("[data-deck-drop]");
  const zone = el?.getAttribute("data-deck-drop");
  return zone === "local" ? zone : null;
}

/** How close to the viewport edge (px) a drag starts scrolling the page. */
const EDGE = 56;

/**
 * Pointer-based drag (mouse and touch) started from a grip handle. The ghost is
 * rendered by the caller at `drag.x/y` with `position: fixed`, so rows never move.
 */
export function useDeckDrag(onDrop: (item: DeckDragItem, zone: DeckDropZone) => void) {
  const [drag, setDrag] = useState<DeckDragState | null>(null);
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const active = drag !== null;

  useEffect(() => {
    if (!active) return;
    let pointerY = -1;
    let raf = 0;
    const scroll = () => {
      if (pointerY >= 0 && pointerY < EDGE) window.scrollBy(0, -8);
      else if (pointerY > window.innerHeight - EDGE) window.scrollBy(0, 8);
      raf = requestAnimationFrame(scroll);
    };
    raf = requestAnimationFrame(scroll);
    const move = (e: PointerEvent) => {
      pointerY = e.clientY;
      const over = zoneAt(e.clientX, e.clientY);
      setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY, over } : d));
    };
    const up = (e: PointerEvent) => {
      const zone = zoneAt(e.clientX, e.clientY);
      const d = dragRef.current;
      setDrag(null);
      if (d && zone) dropRef.current(d.item, zone);
    };
    const cancel = () => setDrag(null);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
    };
  }, [active]);

  function startDrag(e: ReactPointerEvent, item: DeckDragItem) {
    if (e.button !== 0) return;
    e.preventDefault();
    // Touch pointers are implicitly captured by the handle; release so moves report the real target.
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    setDrag({ item, x: e.clientX, y: e.clientY, over: null });
  }

  return { drag, startDrag };
}
