import { createContext, useContext, useEffect, type RefObject } from "react";

export type PromptDock = "" | "left" | "right";
export const PROMPT_DOCKS: readonly PromptDock[] = ["", "left", "right"];

type Span = { left: number; right: number };

const EDGE_PX = 24;
const LOOSE_PX = 32;
const DOCK_PAD_PX = 6;

// A folded-away side has no column, so the edge strip there leaves the pop-up floating.
export function dockAt(x: number, viewWidth: number, columns: { left: Span | null; right: Span | null }): "left" | "right" | null {
  if (x <= EDGE_PX && columns.left) return "left";
  if (x >= viewWidth - EDGE_PX && columns.right) return "right";
  const over = (c: Span | null) => c != null && x >= c.left && x <= c.right;
  if (over(columns.left)) return "left";
  if (over(columns.right)) return "right";
  return null;
}

export function pulledLoose(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= LOOSE_PX;
}

export const PromptDockContext = createContext<{ side: PromptDock; dockable: boolean; setSide: (s: PromptDock) => void } | null>(null);
export const usePromptDockControls = () => useContext(PromptDockContext);

export function dockColumn(side: "left" | "right"): HTMLElement | null {
  const col = document.querySelector<HTMLElement>(`.arena [data-panel-col="${side}"]`);
  if (col?.hasAttribute("data-col-off")) {
    return document.querySelector<HTMLElement>(`.arena [data-panel-col="${side === "left" ? "right" : "left"}"]`);
  }
  return col;
}

export function columnSpans(): { left: Span | null; right: Span | null } {
  const span = (side: "left" | "right") => {
    const col = document.querySelector<HTMLElement>(`.arena [data-panel-col="${side}"]`);
    if (!col || col.hasAttribute("data-col-off")) return null;
    const r = col.getBoundingClientRect();
    return { left: r.left, right: r.right };
  };
  return { left: span("left"), right: span("right") };
}

export function showDropHint(side: "left" | "right" | null) {
  for (const s of ["left", "right"] as const) {
    const col = dockColumn(s);
    if (!col) continue;
    if (s === side) col.setAttribute("data-prompt-drop", "");
    else col.removeAttribute("data-prompt-drop");
  }
}

// Not moved in the React tree, so the picks made so far survive.
export function usePromptDockHost(wrapRef: RefObject<HTMLElement | null>, side: "left" | "right" | null) {
  useEffect(() => {
    const wrap = wrapRef.current;
    const column = side ? dockColumn(side) : null;
    if (!wrap || !side || !column) return;
    const arena = column.closest<HTMLElement>(".arena");
    const host = document.createElement("div");
    host.className = "board-panel prompt-dock-host";
    host.dataset.promptDockHost = side;
    const actions = column.querySelector(":scope > .col-actions");
    column.insertBefore(host, actions ? actions.nextSibling : column.firstChild);
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
