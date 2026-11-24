import { useEffect, type RefObject } from "react";
import { promptSide } from "./promptPlacement";
import { findInstanceBox } from "../layout/useTrackedBoxes";

const BOTTOM_GAP_REM = 1.25;
const TOP_GAP_PX = 8;

export function usePromptDodge(
  wrapRef: RefObject<HTMLElement | null>,
  battle: { defenderId: string; attackerId: string } | null,
  enabled: boolean,
) {
  const defenderId = battle?.defenderId ?? null;
  const attackerId = battle?.attackerId ?? null;
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!enabled || !wrap || !defenderId || !attackerId) return;
    let raf = 0;
    let side: "top" | "bottom" = "bottom";
    const apply = (next: "top" | "bottom", topPx: number) => {
      if (next === "top") {
        wrap.style.setProperty("--prompt-top", `${topPx}px`);
        wrap.style.setProperty("--prompt-bottom", "auto");
        wrap.dataset.top = "";
      } else {
        wrap.style.removeProperty("--prompt-top");
        wrap.style.removeProperty("--prompt-bottom");
        delete wrap.dataset.top;
      }
    };
    let lastTop = -1;
    const tick = () => {
      const el = wrap.querySelector<HTMLElement>(".ability-prompt");
      const mat = document.querySelector<HTMLElement>(".arena .playmat");
      const defender = findInstanceBox(defenderId);
      const placedByPlayer = wrap.dataset.dragged != null;
      if (el && mat && defender && el.offsetHeight > 0 && !placedByPlayer) {
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const rect = el.getBoundingClientRect();
        const height = rect.height;
        const topTop = mat.getBoundingClientRect().top + TOP_GAP_PX;
        const next = promptSide({
          width: rect.width,
          height,
          centerX: rect.left + rect.width / 2,
          bottomTop: window.innerHeight - BOTTOM_GAP_REM * rem - height,
          topTop,
          defender,
          attacker: findInstanceBox(attackerId),
        });
        if (next !== side || (next === "top" && Math.abs(topTop - lastTop) > 0.5)) {
          side = next;
          lastTop = topTop;
          apply(next, topTop);
        }
      }
      raf = window.requestAnimationFrame(tick);
    };
    tick();
    return () => {
      window.cancelAnimationFrame(raf);
      apply("bottom", 0);
    };
  }, [wrapRef, enabled, defenderId, attackerId]);
}
