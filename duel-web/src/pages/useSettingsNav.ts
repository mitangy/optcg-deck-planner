import { useEffect, useState } from "react";

/**
 * Marks a sideways-scrolling row with data-more-start / data-more-end while more of it sits past that edge, so CSS
 * can fade the edge. Returns the cleanup.
 */
export function trackEdgeFade(el: HTMLElement): () => void {
  const update = () => {
    const max = el.scrollWidth - el.clientWidth;
    el.dataset.moreStart = el.scrollLeft > 2 ? "true" : "false";
    el.dataset.moreEnd = el.scrollLeft < max - 2 ? "true" : "false";
  };
  update();
  el.addEventListener("scroll", update, { passive: true });
  const ro = new ResizeObserver(update);
  ro.observe(el);
  const mo = new MutationObserver(update);
  mo.observe(el, { childList: true });
  return () => {
    el.removeEventListener("scroll", update);
    ro.disconnect();
    mo.disconnect();
  };
}

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The chip of the section in view is brought into the row without moving the page. */
export function revealChip(nav: HTMLElement, chip: HTMLElement): void {
  const left = chip.offsetLeft - nav.offsetLeft;
  const right = left + chip.offsetWidth;
  const viewLeft = nav.scrollLeft;
  const viewRight = viewLeft + nav.clientWidth;
  if (left >= viewLeft && right <= viewRight) return;
  const target = left < viewLeft ? left - 8 : right - nav.clientWidth + 8;
  nav.scrollTo({ left: Math.max(0, target), behavior: reducedMotion() ? "auto" : "smooth" });
}

function stickyHeight(el: HTMLElement | null): number {
  if (!el || getComputedStyle(el).position !== "sticky") return 0;
  return Math.round(el.getBoundingClientRect().height);
}

/**
 * Publishes the heights of the stuck section bar and Gameplay chip row as --settings-nav-h and --settings-gnav-h on
 * the page, so scroll margins and the second sticky row clear them. A bar that is not sticky (short landscape
 * windows) counts as 0.
 */
export function useStickyOffsets(page: () => HTMLElement | null, rebuildKey: string): void {
  useEffect(() => {
    const root = page();
    if (!root) return;
    const nav = root.querySelector<HTMLElement>(".settings-jump-bar");
    const gnav = root.querySelector<HTMLElement>(".settings-group-jump");
    const update = () => {
      root.style.setProperty("--settings-nav-h", `${stickyHeight(nav)}px`);
      root.style.setProperty("--settings-gnav-h", `${stickyHeight(gnav)}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    if (nav) ro.observe(nav);
    if (gnav) ro.observe(gnav);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rebuildKey]);
}

/**
 * The id (of `ids`) whose section is in the upper part of the window under the stuck bars, kept current while the
 * page scrolls or resizes. Of the sections in that band, the one that began last at or above the line wins (a jump
 * lands its heading just under it), so with two columns it is the section you most recently scrolled to. At the very
 * bottom of the page the last one wins when it is on screen, so a short last section can be active.
 *
 * Positions are read from the layout on every scroll frame, so they stay right when the header or bar height
 * settles after first paint.
 */
export function useActiveSection(ids: string[], offset: () => number): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join("|");
  useEffect(() => {
    let frame = 0;
    const pick = () => {
      frame = 0;
      const els = ids
        .map((id) => document.getElementById(id))
        .filter((e): e is HTMLElement => e !== null && e.offsetParent !== null);
      if (els.length === 0) return;
      const atBottom =
        window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      const line = offset();
      const lastRect = els[els.length - 1]!.getBoundingClientRect();
      if (atBottom && lastRect.bottom > line && lastRect.top < window.innerHeight) {
        setActive(els[els.length - 1]!.id);
        return;
      }
      const vh = window.innerHeight;
      const bandBottom = line + Math.max(60, 0.4 * (vh - line));
      const tops = els
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { id: el.id, top: r.top, bottom: r.bottom };
        })
        .filter((r) => r.bottom > line && r.top < bandBottom);
      const crossed = tops.filter((r) => r.top <= line + 48).sort((a, b) => b.top - a.top)[0];
      const below = [...tops].sort((a, b) => a.top - b.top)[0];
      const next = (crossed ?? below)?.id;
      if (next) setActive(next);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(pick);
    };
    pick();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return active;
}
