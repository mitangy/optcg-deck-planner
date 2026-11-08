import { useEffect, type RefObject } from "react";

/**
 * Writes two vars on the board root for phone pop-ups:
 * `--hud-h`: how far down the top bar's bottom edge sits in the viewport (safe-area
 * padding included), so pop-ups keep below it and never cover Undo or the menu (#660).
 * `--hand-room`: how much of the viewport's bottom the hand rail (and the bar under it)
 * takes, so pop-ups keep above it and never cover the hand (#663).
 * `--replay-room`: how much of the viewport's bottom a phone's replay bar takes, so the
 * field-pick bar sits above the replay controls instead of covering them (#1095).
 * All are 0 on wide layouts or when there is nothing to measure. `ready` flips once
 * the root has mounted.
 * `--board-top` (every layout): where the board area starts in the viewport, i.e. just
 * below the top bar, so the spectator's far fan can hang from it (it is a fixed box).
 */
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
