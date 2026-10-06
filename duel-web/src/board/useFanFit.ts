import { useLayoutEffect, type RefObject } from "react";
import { fanSpan } from "./handFan";

/**
 * Keeps the desktop fan inside your mat: measures the mat and a card, then sets
 * `--fan-tuck-w` / `--fan-open-w` (the width of the cards' box, tucked and
 * raised) on the fan, capped at the mat's width (see `fanSpan`). board.css
 * falls back to the uncapped widths until they are set.
 */
export function useFanFit(
  fanRef: RefObject<HTMLElement | null>,
  count: number,
  active: boolean,
  /** Changes when the fan moves between the centre spot, floating and docked. */
  variant: string,
  /**
   * Spectators: both hands are only for reading, so the cards spread out wider
   * (`openSpread`, share of a card each one adds) and may use the whole board
   * column (`capSelector`) rather than just your mat.
   */
  opts: { openSpread?: number; capSelector?: string } = {},
): void {
  const { openSpread = 0.8, capSelector = ".arena .side-you" } = opts;
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
        // The handle sits beside the cards inside the same column.
        const head = fan.querySelector<HTMLElement>(".hand-fan-head");
        if (head && getComputedStyle(head).position === "absolute") {
          // Spectators: the label hangs in the column's top corner, so the cards
          // keep clear of it on both sides and stay centred.
          maxW -= 2 * (head.offsetWidth + 16);
        } else {
          const gap = parseFloat(getComputedStyle(fan).columnGap) || 0;
          maxW -= (head?.offsetWidth ?? 0) + gap;
        }
      }
      const cardW = card.offsetWidth;
      fan.style.setProperty("--fan-tuck-w", `${fanSpan(count, cardW, 0.5, maxW)}px`);
      fan.style.setProperty("--fan-open-w", `${fanSpan(count, cardW, openSpread, maxW)}px`);
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (mat) ro.observe(mat);
    ro.observe(fan);
    return () => {
      ro.disconnect();
      clear();
    };
  }, [fanRef, count, active, variant, openSpread, capSelector]);
}
