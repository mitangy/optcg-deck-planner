import { useEffect, type RefObject } from "react";

/**
 * Writes `--hud-h` on the board root: how far down the top bar's bottom edge
 * sits in the viewport (its safe-area padding included). Phone pop-ups keep
 * below it so they never cover Undo or the menu (#660). 0 on wide layouts or
 * when there is no bar. `ready` flips once the root has mounted.
 */
export function useHudHeight(rootRef: RefObject<HTMLElement | null>, wide: boolean, ready: boolean) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !ready) return;
    let bar: HTMLElement | null = null;
    const write = () => {
      const h = bar ? Math.max(0, Math.round(bar.getBoundingClientRect().bottom)) : 0;
      if (root.style.getPropertyValue("--hud-h") !== `${h}px`) root.style.setProperty("--hud-h", `${h}px`);
    };
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(write);
    const find = () => {
      const next = wide ? null : root.querySelector<HTMLElement>(":scope > .hud-bar");
      if (next !== bar) {
        if (bar) ro?.unobserve(bar);
        bar = next;
        if (bar) ro?.observe(bar);
      }
      write();
    };
    ro?.observe(root);
    find();
    // The bar comes and goes with the layout.
    const mo = new MutationObserver(find);
    mo.observe(root, { childList: true });
    window.addEventListener("resize", write);
    return () => {
      ro?.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", write);
    };
  }, [rootRef, wide, ready]);
}
