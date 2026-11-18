import { useLayoutEffect, type RefObject } from "react";

// Read from layout offsets (they ignore transforms), so every mat sizing rule in the stylesheet is followed without repeating its math. Written as CSS variables so the dock moves without a React render.
export function measureSideDock(
  mat: HTMLElement,
): { left: number; seam: number } | null {
  const inner = mat.querySelector<HTMLElement>(":scope > .playmat-inner");
  const you = inner?.querySelector<HTMLElement>(":scope > .side-you");
  if (!inner || !you) return null;
  let left = inner.offsetLeft + you.offsetLeft + you.offsetWidth;
  if (inner.querySelector(":scope > .opp-hand-mat-right")) left = Math.max(left, inner.offsetLeft + inner.offsetWidth);
  return { left: Math.round(left), seam: Math.round(inner.offsetTop + you.offsetTop) };
}

export function useSideDockPlacement(ref: RefObject<HTMLElement | null>, enabled: boolean): void {
  useLayoutEffect(() => {
    const mat = ref.current;
    if (!enabled || !mat) return;
    const apply = () => {
      const at = measureSideDock(mat);
      if (!at) return;
      mat.style.setProperty("--side-dock-left", `${at.left}px`);
      mat.style.setProperty("--side-dock-seam", `${at.seam}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(mat);
    for (const el of mat.querySelectorAll(":scope > .playmat-inner, :scope > .playmat-inner > .side-field")) ro.observe(el);
    return () => {
      ro.disconnect();
      mat.style.removeProperty("--side-dock-left");
      mat.style.removeProperty("--side-dock-seam");
    };
  }, [ref, enabled]);
}
