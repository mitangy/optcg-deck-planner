import { useEffect, type RefObject } from "react";

const VAR = "--sticky-head-h";

/**
 * Publishes the height of the sticky page header around `button` (the header's menu
 * button) as --sticky-head-h on <html>, so other sticky bars and anchor jumps sit below
 * it. Outside a sticky header (or when the header is not sticky) it sets nothing.
 */
export function useStickyHeadHeight(button: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = button.current;
    if (!el) return;
    // On phones the Decks headers stick as just their nav row (.deck-config-nav); elsewhere the <header> sticks.
    const candidates = [el.closest<HTMLElement>(".deck-config-nav"), el.closest<HTMLElement>("header")];
    const root = document.documentElement;
    const update = () => {
      const bar = candidates.find((c) => c && getComputedStyle(c).position === "sticky");
      if (bar) root.style.setProperty(VAR, `${Math.round(bar.getBoundingClientRect().height)}px`);
      else root.style.removeProperty(VAR);
    };
    update();
    const ro = new ResizeObserver(update);
    for (const c of candidates) if (c) ro.observe(c);
    // The nav row and the header swap roles at the phone breakpoint without resizing both.
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      root.style.removeProperty(VAR);
    };
  }, [button]);
}
