import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import type { Dock } from "./panelDock";
import { growOrigin, popFrames, POP_MS, slideFrames, type Rect } from "./panelMotion";

/** Plays the panel's open / close animation on `panelRef`. */
export function usePanelMotion(
  panelRef: RefObject<HTMLDivElement | null>,
  { closing, pending, embedded, edge, dock, origin, onExited }: { closing: boolean; pending: boolean; embedded: HTMLElement | null; edge: boolean; dock: Dock; origin: () => Rect; onExited: () => void },
) {
  // Pops out of the compass when it opens and shrinks back into it when it closes. A docked panel slides from its
  // edge, and one inside the board just appears. No animation (reduced motion, no Web Animations) is an instant open / close.
  const playing = useRef<Animation | null>(null);
  const phase = useRef<"in" | "out" | null>(null);
  useLayoutEffect(() => {
    if (pending) {
      if (closing) onExited();
      return;
    }
    const el = panelRef.current;
    const want = closing ? "out" : "in";
    if (phase.current === want) return;
    phase.current = want;
    const done = closing ? onExited : undefined;
    const reduced = document.documentElement.dataset.motion === "reduce" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!el || embedded || reduced || typeof el.animate !== "function") {
      playing.current?.cancel();
      done?.();
      return;
    }
    playing.current?.cancel();
    let frames;
    if (edge && dock) frames = slideFrames(dock, !closing);
    else {
      const o = growOrigin(origin(), el.getBoundingClientRect());
      el.style.transformOrigin = `${o.x}px ${o.y}px`;
      frames = popFrames(!closing);
    }
    const a = el.animate(frames, { duration: POP_MS, easing: closing ? "ease-in" : "ease-out", fill: closing ? "forwards" : "none" });
    playing.current = a;
    a.onfinish = () => {
      if (playing.current !== a) return;
      playing.current = null;
      el.style.removeProperty("transform-origin");
      done?.();
    };
  }, [closing, pending, embedded, edge, dock, origin, onExited]);
}

/** Beside a modal on desktop: tells the page which side the panel is on and how wide, so the modal makes room. */
export function useLayerRoom(panelRef: RefObject<HTMLDivElement | null>, { inLayer, phone, closing, dock }: { inLayer: boolean; phone: boolean; closing: boolean; dock: Dock }) {
  useEffect(() => {
    const el = panelRef.current;
    if (!inLayer || phone || closing || !el) return;
    const root = document.documentElement;
    const apply = () => {
      root.dataset.lpLayer = dock === "left" ? "left" : "right";
      root.style.setProperty("--lp-layer-w", `${el.offsetWidth}px`);
    };
    apply();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(apply) : null;
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      delete root.dataset.lpLayer;
      root.style.removeProperty("--lp-layer-w");
    };
  }, [inLayer, phone, closing, dock]);
}

/** Phones: the sheet covers the screen, so the page behind must not scroll; it also follows the visual viewport so the composer stays above the keyboard. */
export function usePhoneViewport(panelRef: RefObject<HTMLDivElement | null>, phone: boolean) {
  useEffect(() => {
    if (!phone) return;
    const body = document.body;
    const prev = body.style.overflow;
    body.style.overflow = "hidden";
    const vv = window.visualViewport;
    const el = panelRef.current;
    const fit = () => {
      if (!vv || !el) return;
      el.style.setProperty("--lp-vv-height", `${Math.round(vv.height)}px`);
      el.style.setProperty("--lp-vv-top", `${Math.round(vv.offsetTop)}px`);
    };
    fit();
    vv?.addEventListener("resize", fit);
    vv?.addEventListener("scroll", fit);
    return () => {
      body.style.overflow = prev;
      vv?.removeEventListener("resize", fit);
      vv?.removeEventListener("scroll", fit);
      el?.style.removeProperty("--lp-vv-height");
      el?.style.removeProperty("--lp-vv-top");
    };
  }, [phone]);
}
