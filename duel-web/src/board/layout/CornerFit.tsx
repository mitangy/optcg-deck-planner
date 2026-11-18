import { useLayoutEffect, type RefObject } from "react";
import type { PanelColumn } from "../panels/panelLayout";
import { cornerBounds } from "../hand/fanCorner";

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
