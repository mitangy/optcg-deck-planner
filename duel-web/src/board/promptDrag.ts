import { useEffect, type RefObject } from "react";

export type Offset = { x: number; y: number };
type Rect = { left: number; top: number; right: number; bottom: number };

const EDGE = 8;

/**
 * Offset for a dragged prompt whose undragged box is `base`, kept inside the
 * viewport. A prompt taller or wider than the view keeps its top-left edge on screen.
 */
export function clampPromptOffset(base: Rect, want: Offset, view: { width: number; height: number }): Offset {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)));
  return {
    x: clamp(want.x, EDGE - base.left, view.width - EDGE - base.right),
    y: clamp(want.y, EDGE - base.top, view.height - EDGE - base.bottom),
  };
}

/** The prompt's header row is the grip; its buttons (Hide) still click. */
const GRIP = ".ability-prompt > h3";

/**
 * Lets the player drag a centred prompt by its header. The offset lives on the
 * wrapper as `--prompt-dx` / `--prompt-dy` (the prompt's CSS `translate`), so it
 * carries over to the next prompt in the same spot; double-click the header to
 * put it back. Fixed overlay: moving it shifts nothing else.
 */
export function usePromptDrag(wrapRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let offset: Offset = { x: 0, y: 0 };
    const write = (o: Offset) => {
      offset = o;
      if (o.x === 0 && o.y === 0) {
        wrap.style.removeProperty("--prompt-dx");
        wrap.style.removeProperty("--prompt-dy");
        delete wrap.dataset.dragged;
      } else {
        wrap.style.setProperty("--prompt-dx", `${o.x}px`);
        wrap.style.setProperty("--prompt-dy", `${o.y}px`);
        // Tells usePromptDodge the player placed this prompt (#335).
        wrap.dataset.dragged = "";
      }
    };
    /** The prompt's box without the drag offset. */
    const baseRect = (el: HTMLElement): Rect => {
      const r = el.getBoundingClientRect();
      return { left: r.left - offset.x, right: r.right - offset.x, top: r.top - offset.y, bottom: r.bottom - offset.y };
    };
    const view = () => ({ width: window.innerWidth, height: window.innerHeight });

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as Element | null;
      const grip = target?.closest<HTMLElement>(GRIP);
      if (!grip || !wrap.contains(grip) || target?.closest("button")) return;
      const prompt = grip.parentElement as HTMLElement;
      const base = baseRect(prompt);
      const start = { x: e.clientX, y: e.clientY };
      const from = offset;
      e.preventDefault();
      grip.setPointerCapture?.(e.pointerId);
      prompt.classList.add("is-dragging");
      const move = (ev: PointerEvent) => {
        write(clampPromptOffset(base, { x: from.x + ev.clientX - start.x, y: from.y + ev.clientY - start.y }, view()));
      };
      const end = () => {
        prompt.classList.remove("is-dragging");
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", end);
        grip.removeEventListener("pointercancel", end);
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", end);
      grip.addEventListener("pointercancel", end);
    };
    const onDoubleClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target?.closest(GRIP) && !target.closest("button")) write({ x: 0, y: 0 });
    };
    // A moved prompt must never end up out of reach (#335): re-clamp it when
    // the window shrinks, a new or taller prompt opens in the same spot, it is
    // shown again after Hide, or the battle dodge moves its base spot.
    const reclamp = () => {
      if (offset.x === 0 && offset.y === 0) return;
      const prompt = wrap.querySelector<HTMLElement>(".ability-prompt");
      if (!prompt || prompt.offsetHeight === 0) return;
      const next = clampPromptOffset(baseRect(prompt), offset, view());
      if (next.x !== offset.x || next.y !== offset.y) write(next);
    };
    let raf = 0;
    const reclampSoon = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(reclamp);
    };
    const sizes = new ResizeObserver(reclampSoon);
    const watchPrompt = () => {
      sizes.disconnect();
      const prompt = wrap.querySelector<HTMLElement>(".ability-prompt");
      if (prompt) sizes.observe(prompt);
      reclampSoon();
    };
    const changes = new MutationObserver(watchPrompt);
    changes.observe(wrap, { childList: true, attributes: true, attributeFilter: ["hidden", "style"] });
    watchPrompt();
    wrap.addEventListener("pointerdown", onPointerDown);
    wrap.addEventListener("dblclick", onDoubleClick);
    window.addEventListener("resize", reclampSoon);
    return () => {
      window.cancelAnimationFrame(raf);
      sizes.disconnect();
      changes.disconnect();
      wrap.removeEventListener("pointerdown", onPointerDown);
      wrap.removeEventListener("dblclick", onDoubleClick);
      window.removeEventListener("resize", reclampSoon);
    };
  }, [wrapRef]);
}
