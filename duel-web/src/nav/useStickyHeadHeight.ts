import { useEffect, type RefObject } from "react";

const VAR = "--sticky-head-h";

export function useStickyHeadHeight(button: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = button.current;
    if (!el) return;
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
