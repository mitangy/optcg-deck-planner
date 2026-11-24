import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import type { Dock } from "./panelDock";
import { growOrigin, popFrames, POP_MS, slideFrames, type Rect } from "./panelMotion";

export function usePanelMotion(
  panelRef: RefObject<HTMLDivElement | null>,
  { closing, pending, embedded, edge, dock, origin, onExited }: { closing: boolean; pending: boolean; embedded: HTMLElement | null; edge: boolean; dock: Dock; origin: () => Rect; onExited: () => void },
) {
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

export function useLayerRoom(panelRef: RefObject<HTMLDivElement | null>, { inLayer, phone, closing, dock }: { inLayer: boolean; phone: boolean; closing: boolean; dock: Dock }) {
  useEffect(() => {
    const el = panelRef.current;
    if (!inLayer || closing || !el) return;
    const root = document.documentElement;
    // A phone's bottom sheet is capped (panel.css) so the layer's card stays visible above it.
    const apply = () => {
      if (phone) {
        root.dataset.lpLayer = "sheet";
        root.style.setProperty("--lp-layer-h", `${el.offsetHeight}px`);
        return;
      }
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
      root.style.removeProperty("--lp-layer-h");
    };
  }, [inLayer, phone, closing, dock]);
}

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
