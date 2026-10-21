import { useEffect, type RefObject } from "react";

/**
 * Writes two vars on the board root for phone pop-ups:
 * `--hud-h`: how far down the top bar's bottom edge sits in the viewport (safe-area
 * padding included), so pop-ups keep below it and never cover Undo or the menu (#660).
 * `--hand-room`: how much of the viewport's bottom the hand rail (and the bar under it)
 * takes, so pop-ups keep above it and never cover the hand (#663).
 * Both are 0 on wide layouts or when there is nothing to measure. `ready` flips once
 * the root has mounted.
 */
export function useHudHeight(rootRef: RefObject<HTMLElement | null>, wide: boolean, ready: boolean) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !ready) return;
    let bar: HTMLElement | null = null;
    let hand: HTMLElement | null = null;
    let rail: HTMLElement | null = null;
    const set = (name: string, px: number) => {
      if (root.style.getPropertyValue(name) !== `${px}px`) root.style.setProperty(name, `${px}px`);
    };
    const write = () => {
      set("--hud-h", bar ? Math.max(0, Math.round(bar.getBoundingClientRect().bottom)) : 0);
      const top = hand && hand.getBoundingClientRect().height > 0 ? hand.getBoundingClientRect().top : null;
      set("--hand-room", top == null ? 0 : Math.max(0, Math.round(window.innerHeight - top)));
    };
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(write);
    const swap = (prev: HTMLElement | null, next: HTMLElement | null) => {
      if (prev !== next) {
        if (prev) ro?.unobserve(prev);
        if (next) ro?.observe(next);
      }
      return next;
    };
    const find = () => {
      bar = swap(bar, wide ? null : root.querySelector<HTMLElement>(":scope > .hud-bar"));
      // The hand rail, or whatever fills its place (the defend tray).
      rail = swap(rail, wide ? null : root.querySelector<HTMLElement>(".arena-rail"));
      hand = swap(hand, wide ? null : root.querySelector<HTMLElement>(".arena-rail > .hand-rail, .arena-rail > :first-child"));
      write();
    };
    let raf = 0;
    const later = () => {
      if (!raf) raf = window.requestAnimationFrame(() => ((raf = 0), find()));
    };
    ro?.observe(root);
    find();
    // The bars and the hand come and go, and fold, with the layout.
    const mo = new MutationObserver(later);
    mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden"] });
    window.addEventListener("resize", write);
    return () => {
      ro?.disconnect();
      mo.disconnect();
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", write);
    };
  }, [rootRef, wide, ready]);
}
