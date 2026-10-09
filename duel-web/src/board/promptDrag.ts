import { useEffect, useRef, type RefObject } from "react";
import { updateSettings } from "../settings";
import { columnSpans, dockAt, pulledLoose, showDropHint, type PromptDock } from "./promptDock";

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

/** The saved `promptPos` ("x,y" pixels from centre); "" or anything unreadable is centred. */
export function parsePromptPos(s: string): Offset {
  const [x, y, ...rest] = s.split(",");
  if (y === undefined || rest.length > 0 || !x.trim() || !y.trim()) return { x: 0, y: 0 };
  const o = { x: Number(x), y: Number(y) };
  return Number.isFinite(o.x) && Number.isFinite(o.y) ? o : { x: 0, y: 0 };
}

export function serializePromptPos(o: Offset): string {
  const x = Math.round(o.x);
  const y = Math.round(o.y);
  return x === 0 && y === 0 ? "" : `${x},${y}`;
}

/** The prompt's header row is the grip; its buttons (Hide) still click. */
const GRIP = ".ability-prompt > h3";

/**
 * Lets the player drag a centred prompt by its header. The offset lives on the
 * wrapper as `--prompt-dx` / `--prompt-dy` (the prompt's CSS `translate`).
 * Where a drag ends it is saved as the `promptPos` setting (`saved`), so the
 * next pop-up, or a reload, opens in the same spot (#422); double-click the
 * header to put it back. Only the player's own drags save: a spot squeezed
 * onto a small screen keeps the saved one. Fixed overlay: moving it shifts
 * nothing else.
 *
 * Desktop (`dock.dockable`): letting go with the pointer over a side column or
 * the screen's edge docks the pop-up there (`dock.setSide`, #449), and a drag
 * that pulls a docked pop-up loose floats it again where it was dropped.
 */
export function usePromptDrag(
  wrapRef: RefObject<HTMLElement | null>,
  saved: string,
  dock: { side: PromptDock; dockable: boolean; setSide: (s: PromptDock) => void },
) {
  const { dockable, setSide } = dock;
  const side = dockable ? dock.side : "";
  /** Where a docked pop-up was let go, to float it there once it has left its column. */
  const dropAt = useRef<{ left: number; top: number } | null>(null);
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let offset: Offset = { x: 0, y: 0 };
    const save = (o: Offset) => {
      const pos = serializePromptPos(o);
      if (pos !== saved) updateSettings({ promptPos: pos });
    };
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
      let moved = false;
      /** The column the pointer is over, other than the one the pop-up is already in. */
      const dropSide = (ev: PointerEvent) => {
        if (!dockable) return null;
        const to = dockAt(ev.clientX, window.innerWidth, columnSpans());
        return to === side ? null : to;
      };
      e.preventDefault();
      grip.setPointerCapture?.(e.pointerId);
      prompt.classList.add("is-dragging");
      const move = (ev: PointerEvent) => {
        moved = true;
        write(clampPromptOffset(base, { x: from.x + ev.clientX - start.x, y: from.y + ev.clientY - start.y }, view()));
        if (dockable) showDropHint(dropSide(ev));
      };
      const end = (ev: PointerEvent) => {
        prompt.classList.remove("is-dragging");
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", end);
        grip.removeEventListener("pointercancel", end);
        if (dockable) showDropHint(null);
        if (!moved) return;
        const dropped = ev.type === "pointerup";
        const to = dropped ? dropSide(ev) : null;
        if (to) {
          // Dock (or switch columns): the saved floating spot stays for later.
          write({ x: 0, y: 0 });
          setSide(to);
        } else if (side) {
          const overOwnColumn = dockAt(ev.clientX, window.innerWidth, columnSpans()) === side;
          if (dropped && !overOwnColumn && pulledLoose(offset.x - from.x, offset.y - from.y)) {
            const r = prompt.getBoundingClientRect();
            dropAt.current = { left: r.left, top: r.top };
            setSide("");
          } else write({ x: 0, y: 0 });
        } else save(offset);
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", end);
      grip.addEventListener("pointercancel", end);
    };
    const onDoubleClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!side && target?.closest(GRIP) && !target.closest("button")) {
        write({ x: 0, y: 0 });
        save(offset);
      }
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
    // A docked pop-up sits in its column, not at the saved floating spot.
    write(side ? { x: 0, y: 0 } : parsePromptPos(saved));
    const prompt = wrap.querySelector<HTMLElement>(".ability-prompt");
    if (dropAt.current && !side && prompt) {
      // Pulled out of its column: float it where it was let go.
      write({ x: 0, y: 0 });
      const base = baseRect(prompt);
      write(clampPromptOffset(base, { x: dropAt.current.left - base.left, y: dropAt.current.top - base.top }, view()));
      save(offset);
    }
    dropAt.current = null;
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
  }, [wrapRef, saved, side, dockable, setSide]);
}
