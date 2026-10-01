import { useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";

/** Movement (px) before a gesture counts as a swipe or a scroll. */
const SLOP = 10;
/** Swipes shorter than this never move a deck, however narrow the row. */
const MIN_COMMIT = 72;
/** Wider rows need a longer swipe, capped so big phones do not need a full-width fling. */
const MAX_COMMIT = 140;
/** How long the row takes to slide off before the move runs (ms). */
const EXIT_MS = 180;

/**
 * Which way the gesture is going once it has moved past the slop: "x" is a
 * swipe the row follows, "y" is a scroll the browser keeps.
 */
export function swipeAxis(dx: number, dy: number): "x" | "y" | null {
  if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return null;
  return Math.abs(dx) > Math.abs(dy) ? "x" : "y";
}

/** A released swipe moves the deck once it has travelled ~40% of the row (72-140px). */
export function swipeCommits(dx: number, rowWidth: number): boolean {
  const need = Math.min(MAX_COMMIT, Math.max(MIN_COMMIT, rowWidth * 0.4));
  return Math.abs(dx) >= need;
}

type Gesture = { id: number; x: number; y: number; width: number; axis: "x" | "y" | null };

/**
 * Phone Decks page: swipe a row sideways (either way) to move the deck to the
 * other list. Rows use `touch-action: pan-y`, so vertical scrolling stays with
 * the browser (it sends `pointercancel`) and only sideways moves reach here.
 */
export function useSwipeMove(enabled: boolean, onMove: () => void) {
  const [dx, setDx] = useState(0);
  const [phase, setPhase] = useState<"idle" | "dragging" | "settling" | "leaving">("idle");
  const gesture = useRef<Gesture | null>(null);
  const swiped = useRef(false);
  const moveRef = useRef(onMove);
  moveRef.current = onMove;

  function reset() {
    gesture.current = null;
    setPhase("settling");
    setDx(0);
  }

  const handlers = {
    onPointerDown(e: ReactPointerEvent<HTMLElement>) {
      if (!enabled || phase === "leaving" || (e.pointerType === "mouse" && e.button !== 0)) return;
      swiped.current = false;
      gesture.current = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        width: e.currentTarget.getBoundingClientRect().width,
        axis: null,
      };
    },
    onPointerMove(e: ReactPointerEvent<HTMLElement>) {
      const g = gesture.current;
      if (!g || g.id !== e.pointerId) return;
      const mx = e.clientX - g.x;
      if (g.axis === null) {
        g.axis = swipeAxis(mx, e.clientY - g.y);
        if (g.axis === "y") {
          gesture.current = null;
          return;
        }
        if (g.axis === "x") e.currentTarget.setPointerCapture?.(e.pointerId);
      }
      if (g.axis !== "x") return;
      swiped.current = true;
      setPhase("dragging");
      setDx(mx);
    },
    onPointerUp(e: ReactPointerEvent<HTMLElement>) {
      const g = gesture.current;
      if (!g || g.id !== e.pointerId) return;
      if (g.axis !== "x") {
        gesture.current = null;
        return;
      }
      const mx = e.clientX - g.x;
      if (!swipeCommits(mx, g.width)) {
        reset();
        return;
      }
      gesture.current = null;
      setPhase("leaving");
      setDx(Math.sign(mx) * (g.width + 24));
      window.setTimeout(() => {
        moveRef.current();
        // The row usually unmounts; if the move failed it slides back in.
        setPhase("settling");
        setDx(0);
      }, EXIT_MS);
    },
    onPointerCancel(e: ReactPointerEvent<HTMLElement>) {
      if (gesture.current?.id === e.pointerId) reset();
    },
    /** A swipe must not also open the deck or tick its checkbox. */
    onClickCapture(e: ReactMouseEvent<HTMLElement>) {
      if (!swiped.current) return;
      swiped.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };

  const g = gesture.current;
  const armed = phase === "leaving" || (g !== null && swipeCommits(dx, g.width));
  return { dx, phase, armed, handlers: enabled ? handlers : {} };
}
