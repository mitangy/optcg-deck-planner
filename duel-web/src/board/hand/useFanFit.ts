import { useLayoutEffect, type RefObject } from "react";
import { fanSpan } from "./handFanGeometry";

// board.css falls back to the uncapped widths until they are set.
export function useFanFit(
  fanRef: RefObject<HTMLElement | null>,
  count: number,
  active: boolean,
  variant: string,
  capSelector = ".arena .side-you",
): void {
  useLayoutEffect(() => {
    const fan = fanRef.current;
    if (!active || !fan) return;
    const mat = document.querySelector<HTMLElement>(capSelector);
    const clear = () => {
      fan.style.removeProperty("--fan-tuck-w");
      fan.style.removeProperty("--fan-open-w");
    };
    const fit = () => {
      const card = fan.querySelector<HTMLElement>(".hand-fan-cards > *");
      if (!mat || !card || card.offsetWidth === 0) return clear();
      let maxW = mat.getBoundingClientRect().width;
      if (fan.classList.contains("hand-fan-center")) {
        const head = fan.querySelector<HTMLElement>(".hand-fan-head");
        const gap = parseFloat(getComputedStyle(fan).columnGap) || 0;
        maxW -= (head?.offsetWidth ?? 0) + gap;
      }
      const cardW = card.offsetWidth;
      fan.style.setProperty("--fan-tuck-w", `${fanSpan(count, cardW, 0.5, maxW)}px`);
      fan.style.setProperty("--fan-open-w", `${fanSpan(count, cardW, 0.8, maxW)}px`);
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (mat) ro.observe(mat);
    ro.observe(fan);
    return () => {
      ro.disconnect();
      clear();
    };
  }, [fanRef, count, active, variant, capSelector]);
}
