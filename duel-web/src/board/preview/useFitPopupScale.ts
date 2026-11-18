import { useLayoutEffect, type RefObject } from "react";
import { usePopupScale } from "./PopupSizeButtons";

export function fitPopupScale(scale: number, natural: number, room: number): number {
  if (scale <= 1 || natural <= 0 || natural * scale <= room) return scale;
  return Math.max(1, room / natural);
}

export function useFitPopupScale(ref: RefObject<HTMLElement | null>): void {
  const scale = usePopupScale();
  useLayoutEffect(() => {
    const el = ref.current;
    const layer = el?.parentElement;
    if (!el || !layer) return;
    const fit = () => {
      el.style.removeProperty("--popup-scale");
      if (scale <= 1) return;
      const cs = getComputedStyle(layer);
      const room = layer.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      // A narrower layout width makes the cards bigger in layout units, so one step undershoots: repeat until it settles.
      let at = scale;
      for (let i = 0; i < 8; i += 1) {
        const next = fitPopupScale(at, el.offsetHeight, room);
        if (Math.abs(next - at) < 0.005) break;
        at = next;
        el.style.setProperty("--popup-scale", String(at));
      }
      if (at === scale) el.style.removeProperty("--popup-scale");
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  });
}
