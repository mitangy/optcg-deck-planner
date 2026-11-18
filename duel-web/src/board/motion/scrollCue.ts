import { useCallback, useLayoutEffect, useState, type RefObject } from "react";

// Sub-pixel rounding must not show a cue for text that fits.
const SLACK_PX = 2;

export function moreBelow(box: { scrollTop: number; clientHeight: number; scrollHeight: number }): boolean {
  return box.scrollHeight - box.scrollTop - box.clientHeight > SLACK_PX;
}

export function useMoreBelow(
  ref: RefObject<HTMLElement | null>,
  deps: readonly unknown[],
): { more: boolean; onScroll: () => void } {
  const [more, setMore] = useState(false);
  const check = useCallback(() => {
    const el = ref.current;
    setMore(el ? moreBelow(el) : false);
  }, [ref]);
  useLayoutEffect(() => {
    check();
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [check, ...deps]);
  return { more, onScroll: check };
}
