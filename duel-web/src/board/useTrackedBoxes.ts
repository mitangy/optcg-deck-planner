import { useEffect, useState } from "react";
import { sameBox, type Box } from "./battleArc";

/** Viewport rect of the board card rendered for this instance id. */
export function findInstanceBox(instanceId: string): Box | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector<HTMLElement>(
    `[data-instance-id="${CSS.escape(instanceId)}"]`,
  );
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/**
 * Tracks board card rects while `ids` is non-null. A rAF loop (a couple of
 * getBoundingClientRect calls per frame; state only updates on change) keeps
 * overlays glued to cards through resizes, rail scrolls, reflow and zoom
 * without wiring observers onto every ancestor.
 */
export function useTrackedBoxes(ids: string[] | null): (Box | null)[] | null {
  const [boxes, setBoxes] = useState<(Box | null)[] | null>(null);
  const key = ids?.join("|") ?? "";
  useEffect(() => {
    if (!key) {
      setBoxes(null);
      return;
    }
    const list = key.split("|");
    let raf = 0;
    let last: (Box | null)[] = [];
    const tick = () => {
      const next = list.map(findInstanceBox);
      if (next.length !== last.length || next.some((b, i) => !sameBox(b, last[i] ?? null))) {
        last = next;
        setBoxes(next);
      }
      raf = window.requestAnimationFrame(tick);
    };
    tick();
    return () => window.cancelAnimationFrame(raf);
  }, [key]);
  return key ? boxes : null;
}
