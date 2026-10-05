import { useEffect, type RefObject } from "react";
import { promptSide } from "./promptPlacement";
import { findInstanceBox } from "./useTrackedBoxes";

/** Matches `.arena.arena-wide .ability-prompt { bottom: 1.25rem }` in board.css. */
const BOTTOM_GAP_REM = 1.25;
const TOP_GAP_PX = 8;

/**
 * Desktop: while a battle is on, keep the centred effect prompt off the card
 * being hit. Tracks the prompt and the two cards (rAF, writes only when the
 * side changes) and sets `--prompt-top` / `--prompt-bottom` on the wrapper,
 * which the prompt inherits. The prompt is fixed, so moving it shifts nothing.
 */
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
      } else {
        wrap.style.removeProperty("--prompt-top");
        wrap.style.removeProperty("--prompt-bottom");
      }
    };
    let lastTop = -1;
    const tick = () => {
      const el = wrap.querySelector<HTMLElement>(".ability-prompt");
      const mat = document.querySelector<HTMLElement>(".arena .playmat");
      const defender = findInstanceBox(defenderId);
      if (el && mat && defender && el.offsetHeight > 0) {
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const rect = el.getBoundingClientRect();
        const height = el.offsetHeight;
        const topTop = mat.getBoundingClientRect().top + TOP_GAP_PX;
        const next = promptSide({
          width: el.offsetWidth,
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
