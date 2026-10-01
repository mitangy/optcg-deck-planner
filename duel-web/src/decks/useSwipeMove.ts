import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { buzz } from "../board/haptics";

/** Movement (px) before a gesture counts as a swipe or a scroll. */
const SLOP = 10;
/** Swipes shorter than this never move a deck, however narrow the row. */
const MIN_COMMIT = 72;
/** Wider rows need a longer swipe, capped so big phones do not need a full-width fling. */
const MAX_COMMIT = 140;
/** A quick flick (px/ms) moves the deck after only this far. */
const FLICK_SPEED = 0.6;
const FLICK_MIN = 40;
/** Row slides off, then its slot closes, then the move runs (ms; match styles.css). */
export const SWIPE_EXIT_MS = 170;
export const SWIPE_COLLAPSE_MS = 200;

/**
 * Which way the gesture is going once it has moved past the slop: "x" is a
 * swipe the row follows, "y" is a scroll the browser keeps.
 */
export function swipeAxis(dx: number, dy: number): "x" | "y" | null {
  if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return null;
  return Math.abs(dx) > Math.abs(dy) ? "x" : "y";
}

/** Swipe distance that moves the deck: ~40% of the row, 72-140px. */
export function swipeDistance(rowWidth: number): number {
  return Math.min(MAX_COMMIT, Math.max(MIN_COMMIT, rowWidth * 0.4));
}

/**
 * A released swipe moves the deck once it has travelled the swipe distance,
 * or on a quick flick the same way it is pointing (`velocity` in px/ms, signed).
 */
export function swipeCommits(dx: number, rowWidth: number, velocity = 0): boolean {
  if (Math.abs(dx) >= swipeDistance(rowWidth)) return true;
  return Math.abs(dx) >= FLICK_MIN && Math.abs(velocity) >= FLICK_SPEED && Math.sign(velocity) === Math.sign(dx);
}

type Gesture = {
  id: number;
  x: number;
  y: number;
  width: number;
  axis: "x" | "y" | null;
  /** Last two samples, for release velocity. */
  lastX: number;
  lastT: number;
  vx: number;
};

export type SwipePhase = "idle" | "dragging" | "settling" | "leaving" | "collapsing";

/**
 * Phone Decks page: swipe a row sideways (either way) to move the deck to the
 * other list. Rows use `touch-action: pan-y`, so vertical scrolling stays with
 * the browser (it sends `pointercancel`) and only sideways moves reach here.
 * On release past the swipe distance the row slides off, its slot closes, and
 * then `onMove` runs, so the rows below glide up instead of jumping.
 */
export function useSwipeMove(enabled: boolean, onMove: () => unknown) {
  const [dx, setDx] = useState(0);
  const [phase, setPhase] = useState<SwipePhase>("idle");
  const [width, setWidth] = useState(0);
  const gesture = useRef<Gesture | null>(null);
  const swiped = useRef(false);
  const wasArmed = useRef(false);
  const timers = useRef<number[]>([]);
  const moveRef = useRef<() => unknown>(onMove);
  moveRef.current = onMove;

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  function later(ms: number, fn: () => void) {
    timers.current.push(window.setTimeout(fn, ms));
  }

  function settle() {
    gesture.current = null;
    wasArmed.current = false;
    setPhase("settling");
    setDx(0);
  }

  const handlers = {
    onPointerDown(e: ReactPointerEvent<HTMLElement>) {
      if (phase === "leaving" || phase === "collapsing") return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      swiped.current = false;
      const w = e.currentTarget.getBoundingClientRect().width;
      setWidth(w);
      gesture.current = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        width: w,
        axis: null,
        lastX: e.clientX,
        lastT: e.timeStamp,
        vx: 0,
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
      const dt = e.timeStamp - g.lastT;
      if (dt > 0) {
        // Smoothed so one jittery sample does not decide a flick.
        g.vx = 0.6 * ((e.clientX - g.lastX) / dt) + 0.4 * g.vx;
        g.lastX = e.clientX;
        g.lastT = e.timeStamp;
      }
      const armed = Math.abs(mx) >= swipeDistance(g.width);
      if (armed && !wasArmed.current) buzz("pickup");
      wasArmed.current = armed;
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
      // A finger that stopped before lifting is not a flick.
      const vx = e.timeStamp - g.lastT > 80 ? 0 : g.vx;
      if (!swipeCommits(mx, g.width, vx)) {
        settle();
        return;
      }
      gesture.current = null;
      wasArmed.current = false;
      buzz("drop");
      setPhase("leaving");
      setDx(Math.sign(mx) * (g.width + 16));
      later(SWIPE_EXIT_MS, () => setPhase("collapsing"));
      later(SWIPE_EXIT_MS + SWIPE_COLLAPSE_MS, () => {
        // The row stays closed until it unmounts; only a move that reports
        // failure (false) slides it back in.
        void Promise.resolve(moveRef.current()).then((ok) => {
          if (ok === false) settle();
        });
      });
    },
    onPointerCancel(e: ReactPointerEvent<HTMLElement>) {
      if (gesture.current?.id === e.pointerId) settle();
    },
    /** A swipe must not also open the deck or tick its checkbox. */
    onClickCapture(e: ReactMouseEvent<HTMLElement>) {
      if (!swiped.current) return;
      swiped.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };

  const distance = swipeDistance(width || 1);
  const progress = phase === "leaving" || phase === "collapsing" ? 1 : Math.min(1, Math.abs(dx) / distance);
  return { dx, phase, progress, armed: progress >= 1, handlers: enabled ? handlers : {} };
}
