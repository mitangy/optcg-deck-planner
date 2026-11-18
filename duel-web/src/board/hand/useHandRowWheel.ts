import { useEffect, type RefObject } from "react";

// A vertical wheel turn scrolls an overflowing hand row sideways.
export function useHandRowWheel(
  handRowRef: RefObject<HTMLDivElement | null>,
  handCollapsed: boolean,
  wide: boolean,
  railHand: boolean,
  handCount: number | undefined,
) {
  useEffect(() => {
    const el = handRowRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [handRowRef, handCollapsed, wide, railHand, handCount]);
}
