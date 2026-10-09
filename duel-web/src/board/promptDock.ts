import { createContext, useContext, useEffect, type RefObject } from "react";

/** The `promptDock` setting: the side column pop-ups dock into, "" = floating. */
export type PromptDock = "" | "left" | "right";
export const PROMPT_DOCKS: readonly PromptDock[] = ["", "left", "right"];

type Span = { left: number; right: number };

/** A pointer this close to the screen's left / right edge docks on that side. */
const EDGE_PX = 24;
/** A docked pop-up's header has to be pulled this far before it comes loose. */
const LOOSE_PX = 32;
/** Space around a docked pop-up inside its column. */
const DOCK_PAD_PX = 6;

/**
 * Which side a pop-up dropped with the pointer at `x` docks to: the screen's
 * edge strip or anywhere over a side column. `columns` are the columns' spans
 * (null where there is none); null = it stays floating.
 */
export function dockAt(x: number, viewWidth: number, columns: { left: Span | null; right: Span | null }): "left" | "right" | null {
  if (x <= EDGE_PX) return "left";
  if (x >= viewWidth - EDGE_PX) return "right";
  const over = (c: Span | null) => c != null && x >= c.left && x <= c.right;
  if (over(columns.left)) return "left";
  if (over(columns.right)) return "right";
  return null;
}

/** A docked pop-up dragged this far from where it sat is pulled out of its column. */
export function pulledLoose(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= LOOSE_PX;
}

/** The dock buttons' view of the pop-up; null outside a HideablePrompt. */
export const PromptDockContext = createContext<{ side: PromptDock; dockable: boolean; setSide: (s: PromptDock) => void } | null>(null);
export const usePromptDockControls = () => useContext(PromptDockContext);

/** The side column element for `side` on the desktop board, if it is shown. */
export function dockColumn(side: "left" | "right"): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.arena [data-panel-col="${side}"]`);
}

/** Both columns' horizontal spans, for `dockAt`. */
export function columnSpans(): { left: Span | null; right: Span | null } {
  const span = (side: "left" | "right") => {
    const r = dockColumn(side)?.getBoundingClientRect();
    return r ? { left: r.left, right: r.right } : null;
  };
  return { left: span("left"), right: span("right") };
}

/** Shows (or clears, with null) the drop hint on a column while a pop-up is dragged over it. */
export function showDropHint(side: "left" | "right" | null) {
  for (const s of ["left", "right"] as const) {
    const col = dockColumn(s);
    if (!col) continue;
    if (s === side) col.setAttribute("data-prompt-drop", "");
    else col.removeAttribute("data-prompt-drop");
  }
}

/**
 * Docks the pop-up into a side column without moving it in the React tree (so
 * the picks made so far survive). A host block sits first in the column and
 * takes the pop-up's height (the other panels give way); the pop-up itself
 * stays a fixed overlay and is placed over that host (`--dock-*` on the
 * wrapper). The board root gets `data-prompt-dock` so the column is wide enough.
 */
export function usePromptDockHost(wrapRef: RefObject<HTMLElement | null>, side: "left" | "right" | null) {
  useEffect(() => {
    const wrap = wrapRef.current;
    const column = side ? dockColumn(side) : null;
    if (!wrap || !side || !column) return;
    const arena = column.closest<HTMLElement>(".arena");
    const host = document.createElement("div");
    host.className = "board-panel prompt-dock-host";
    host.dataset.promptDockHost = side;
    column.insertBefore(host, column.firstChild);
    arena?.setAttribute("data-prompt-dock", side);
    wrap.dataset.docked = side;
    let raf = 0;
    let last = "";
    const tick = () => {
      raf = window.requestAnimationFrame(tick);
      const prompt = wrap.querySelector<HTMLElement>(".ability-prompt");
      // Hidden pop-up: its column goes back to the panels until the Back pill.
      host.style.display = wrap.hidden ? "none" : "";
      if (!prompt || wrap.hidden) return;
      const h = `${prompt.offsetHeight + 2 * DOCK_PAD_PX}px`;
      if (host.style.height !== h) host.style.height = h;
      const r = host.getBoundingClientRect();
      const key = `${r.left}|${r.top}|${r.width}`;
      if (key === last) return;
      last = key;
      wrap.style.setProperty("--dock-l", `${r.left + DOCK_PAD_PX}px`);
      wrap.style.setProperty("--dock-t", `${r.top + DOCK_PAD_PX}px`);
      wrap.style.setProperty("--dock-w", `${Math.max(0, r.width - 2 * DOCK_PAD_PX)}px`);
    };
    tick();
    return () => {
      window.cancelAnimationFrame(raf);
      host.remove();
      arena?.removeAttribute("data-prompt-dock");
      delete wrap.dataset.docked;
      for (const v of ["--dock-l", "--dock-t", "--dock-w"]) wrap.style.removeProperty(v);
    };
  }, [wrapRef, side]);
}
