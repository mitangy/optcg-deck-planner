import { useLayoutEffect, type RefObject } from "react";
import type { PanelColumn } from "./panelLayout";
import { cornerBounds } from "./fanCorner";

/**
 * Sizes the corner hand (#633): measures your mat and sets `--corner-l` /
 * `--corner-r` (the corner spans from the mat's edge to the screen edge on the
 * column's side) and `--corner-w` on the fan. Renders nothing; it is a child of
 * the fan so it only exists while the corner is in use.
 */
export function CornerFit({ fanRef, column }: { fanRef: RefObject<HTMLElement | null>; column: PanelColumn }) {
  useLayoutEffect(() => {
    const fan = fanRef.current;
    if (!fan) return;
    const mat = document.querySelector<HTMLElement>(".arena .side-you");
    const set = () => {
      const vw = document.documentElement.clientWidth;
      const r = mat?.getBoundingClientRect();
      const b = cornerBounds(column, r ? { left: r.left, right: r.right } : { left: 0, right: vw }, vw);
      fan.style.setProperty("--corner-l", `${b.left}px`);
      fan.style.setProperty("--corner-r", `${b.right}px`);
      fan.style.setProperty("--corner-w", `${b.width}px`);
    };
    set();
    const ro = new ResizeObserver(set);
    if (mat) ro.observe(mat);
    const playmat = mat?.closest<HTMLElement>(".playmat");
    if (playmat) ro.observe(playmat);
    ro.observe(document.documentElement);
    window.addEventListener("resize", set);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", set);
      for (const v of ["--corner-l", "--corner-r", "--corner-w"]) fan.style.removeProperty(v);
    };
  }, [fanRef, column]);
  return null;
}
