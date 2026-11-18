import { useEffect, type RefObject } from "react";

// `--board-top`: where the board area starts, so the spectator's far fan (a fixed box) can hang from it.
export function useHudHeight(rootRef: RefObject<HTMLElement | null>, wide: boolean, ready: boolean) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !ready) return;
    let bar: HTMLElement | null = null;
    let hand: HTMLElement | null = null;
    let rail: HTMLElement | null = null;
    let body: HTMLElement | null = null;
    let replayBar: HTMLElement | null = null;
    const set = (name: string, px: number) => {
      if (root.style.getPropertyValue(name) !== `${px}px`) root.style.setProperty(name, `${px}px`);
    };
    const write = () => {
      set("--hud-h", bar ? Math.max(0, Math.round(bar.getBoundingClientRect().bottom)) : 0);
      set("--board-top", body ? Math.max(0, Math.round(body.getBoundingClientRect().top)) : 0);
      const top = hand && hand.getBoundingClientRect().height > 0 ? hand.getBoundingClientRect().top : null;
      const rb = replayBar?.getBoundingClientRect();
      set("--replay-room", rb && rb.height > 0 ? Math.max(0, Math.round(window.innerHeight - rb.top)) : 0);
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
      body = swap(body, root.querySelector<HTMLElement>(":scope > .arena-body"));
      bar = swap(bar, wide ? null : root.querySelector<HTMLElement>(":scope > .hud-bar"));
      replayBar = swap(replayBar, wide ? null : root.querySelector<HTMLElement>(".replay-bar"));
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
