import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type RefObject } from "react";
import { clampPos, dragPos, keyPos, readPos, roomAt, writePos, type Pos } from "./panelPos";
import { clampDockW, dockAt, dragDockW, floatBeside, floatSize, keyDock, looseAt, pulledLoose, type Dock, type DockSide, type DockSides } from "./panelDock";
import type { Rect } from "./panelMotion";
import { clampSheet, clampSize, dragRect, dragSheet, keyRect, maxSize, MIN_H, MIN_W, readSheet, readSize, writeSheet, writeSize, type Edge, type Frame, type Size } from "./panelSize";

const viewportSize = (): Size => ({ w: window.innerWidth, h: window.innerHeight });

/**
 * The desktop panel's remembered size and position, kept inside the window as the window changes. Size is null
 * while it has its default (full-height drawer) size; position is null while it sits in the bottom-right corner.
 * `vp` is the room the size may grow into (the window less the gap to the right and bottom edges), which is what
 * the resize handles clamp against; `viewport` is the whole window.
 */
export function useDrawerSize() {
  const [stored, setStored] = useState<Size | null>(() => readSize());
  const [storedPos, setStoredPos] = useState<Pos | null>(() => readPos());
  const [viewport, setVp] = useState<Size>(viewportSize);
  useEffect(() => {
    const on = () => setVp(viewportSize());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  // Clamped when drawn, never in storage: a window that grows again gives the remembered size and place back.
  const size = stored ? clampSize(stored, viewport) : null;
  const pos = size && storedPos ? clampPos(storedPos, size, viewport) : null;
  return {
    size,
    pos,
    vp: roomAt(viewport, pos),
    viewport,
    set: setStored,
    setPos: setStoredPos,
    commit: useCallback((s: Size) => {
      setStored(s);
      writeSize(s);
    }, []),
    commitPos: useCallback((p: Pos) => {
      setStoredPos(p);
      writePos(p);
    }, []),
    reset: useCallback(() => {
      setStored(null);
      writeSize(null);
    }, []),
    resetPos: useCallback(() => {
      setStoredPos(null);
      writePos(null);
    }, []),
  };
}
export type DrawerSize = ReturnType<typeof useDrawerSize>;

const LABELS: Record<Edge, string> = {
  top: "Resize Log Pose taller or shorter from the top. Use the up and down arrow keys, or double-click to reset.",
  bottom: "Resize Log Pose taller or shorter from the bottom. Use the up and down arrow keys, or double-click to reset.",
  left: "Resize Log Pose wider or narrower from the left. Use the left and right arrow keys, or double-click to reset.",
  right: "Resize Log Pose wider or narrower from the right. Use the left and right arrow keys, or double-click to reset.",
  "top-left": "Resize Log Pose from its top-left corner. Use the arrow keys, or double-click to reset.",
  "top-right": "Resize Log Pose from its top-right corner. Use the arrow keys, or double-click to reset.",
  "bottom-left": "Resize Log Pose from its bottom-left corner. Use the arrow keys, or double-click to reset.",
  "bottom-right": "Resize Log Pose from its bottom-right corner. Use the arrow keys, or double-click to reset.",
};

function Handle({ edge, drawer, panelRef }: { edge: Edge; drawer: DrawerSize; panelRef: RefObject<HTMLDivElement | null> }) {
  const drag = useRef<{ x: number; y: number; start: Frame } | null>(null);
  // The window now: the remembered size and place, or (for the default drawer) what is on screen.
  const current = (): Frame => {
    const r = panelRef.current?.getBoundingClientRect();
    const { viewport } = drawer;
    // The default drawer's measured size is used as it is (it can be the full viewport height), so a drag starts from what is on screen.
    const size = drawer.size ?? (r ? { w: Math.round(r.width), h: Math.round(r.height) } : { w: MIN_W, h: MIN_H });
    const pos = drawer.pos ?? (r ? clampPos({ r: viewport.w - r.right, b: viewport.h - r.bottom }, size, viewport) : { r: 0, b: 0 });
    return { size, pos };
  };
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, start: current() };
  };
  const next = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current!;
    return dragRect(d.start, edge, e.clientX - d.x, e.clientY - d.y, drawer.viewport);
  };
  // Dragging only the top or left edge leaves the place alone, so the window stays in the corner it was in.
  const place = (rect: Frame, apply: (s: Size, p: Pos | null) => void) => {
    const start = drag.current!.start.pos;
    apply(rect.size, rect.pos.r !== start.r || rect.pos.b !== start.b || drawer.pos ? rect.pos : null);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    place(next(e), (s, p) => {
      drawer.set(s);
      if (p) drawer.setPos(p);
    });
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    place(next(e), (s, p) => {
      drawer.commit(s);
      if (p) drawer.commitPos(p);
    });
    drag.current = null;
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const start = current();
    const rect = keyRect(start, edge, e.key, e.shiftKey, drawer.viewport);
    if (!rect) return;
    e.preventDefault();
    drawer.commit(rect.size);
    if (drawer.pos || rect.pos.r !== start.pos.r || rect.pos.b !== start.pos.b) drawer.commitPos(rect.pos);
  };
  const max = maxSize(drawer.vp);
  const vertical = edge === "top" || edge === "bottom";
  const horizontal = edge === "left" || edge === "right";
  const now = vertical ? (drawer.size?.h ?? drawer.vp.h) : horizontal ? (drawer.size?.w ?? Math.min(420, drawer.vp.w)) : undefined;
  return (
    <div
      className={`lp-resize lp-resize-${edge}`}
      role="separator"
      aria-orientation={vertical ? "horizontal" : horizontal ? "vertical" : undefined}
      aria-label={LABELS[edge]}
      aria-valuenow={now}
      aria-valuemin={vertical ? MIN_H : horizontal ? MIN_W : undefined}
      aria-valuemax={vertical ? max.h : horizontal ? max.w : undefined}
      tabIndex={0}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onKeyDown={onKey}
      onDoubleClick={drawer.reset}
    />
  );
}

const EDGES: Edge[] = ["top", "bottom", "left", "right", "top-left", "top-right", "bottom-left", "bottom-right"];

/** Drag handles on all four edges and all four corners of the floating window. */
export function ResizeHandles({ drawer, panelRef }: { drawer: DrawerSize; panelRef: RefObject<HTMLDivElement | null> }) {
  return (
    <>
      {EDGES.map((edge) => (
        <Handle key={edge} edge={edge} drawer={drawer} panelRef={panelRef} />
      ))}
    </>
  );
}

const screenHeight = () => window.visualViewport?.height ?? window.innerHeight;

/** The phone sheet's height as a share of the screen, set as --lp-sheet-h on the panel while a phone sheet is showing. */
export function useSheetHeight(panelRef: RefObject<HTMLDivElement | null>, phone: boolean) {
  const [frac, setFrac] = useState(() => readSheet());
  useEffect(() => {
    const el = panelRef.current;
    if (!phone || !el) return;
    const apply = () => el.style.setProperty("--lp-sheet-h", `${Math.round(frac * screenHeight())}px`);
    apply();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", apply);
    window.addEventListener("resize", apply);
    return () => {
      vv?.removeEventListener("resize", apply);
      window.removeEventListener("resize", apply);
      el.style.removeProperty("--lp-sheet-h");
    };
  }, [panelRef, phone, frac]);
  return { frac, setFrac };
}

/** The sheet's grab handle: drag it up or down, or use the arrow keys. */
export function SheetGrip({ frac, setFrac }: ReturnType<typeof useSheetHeight>) {
  const drag = useRef<{ y: number; frac: number } | null>(null);
  const live = useRef(frac);
  live.current = frac;
  const onDown = (e: PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, frac };
  };
  const onMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (drag.current) setFrac(dragSheet(drag.current.frac, drag.current.y, e.clientY, screenHeight()));
  };
  const onUp = () => {
    if (!drag.current) return;
    drag.current = null;
    const f = clampSheet(live.current, true);
    setFrac(f);
    writeSheet(f);
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 0.15 : 0.05;
    const f = e.key === "ArrowUp" ? frac + step : e.key === "ArrowDown" ? frac - step : e.key === "Home" ? 1 : null;
    if (f === null) return;
    e.preventDefault();
    const next = clampSheet(f, true);
    setFrac(next);
    writeSheet(next);
  };
  return (
    <button
      type="button"
      className="lp-grip"
      aria-label="Resize Log Pose. Drag up or down, or use the up and down arrow keys."
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onKeyDown={onKey}
      onDoubleClick={() => {
        setFrac(1);
        writeSheet(1);
      }}
    >
      <span className="lp-grip-bar" aria-hidden="true" />
    </button>
  );
}

/** The game board's side columns, measured now (their screen rects); null for a side that has none. */
function boardColumns(): { left: DOMRect | null; right: DOMRect | null } {
  const out: { left: DOMRect | null; right: DOMRect | null } = { left: null, right: null };
  for (const col of document.querySelectorAll<HTMLElement>("[data-panel-col]")) {
    const side = col.dataset.panelCol;
    if ((side === "left" || side === "right") && col.dataset.colOff === undefined) out[side] = col.getBoundingClientRect();
  }
  return out;
}

/** What the header drag needs to know about docking (provided by the Log Pose provider). */
export type DockControl = {
  /** Docked now (to the screen edge, or into a board column); null while it floats. */
  dock: Dock;
  /** Docking is possible here: a desktop page, or a board that has side columns. */
  enabled: boolean;
  /** On a game board: docking targets the board's columns, and the width is the column's. */
  inGame: boolean;
  /** On a game board, the sides that have a column shown; a drag or key never docks to the others. */
  sides?: DockSides;
  width: number;
  setDock: (dock: Dock) => void;
};

/** The translucent area shown while a drag would dock: the column it lands in, or the strip at the screen edge. */
export type DockPreview = { side: DockSide; rect: Rect };

/**
 * Moving the desktop panel: drag its header (anywhere that isn't a button) or use the arrow keys on the move grip;
 * double-click the header to put it back in the corner. The first move gives the default drawer an explicit size,
 * since a window that moves can't also be as tall as the screen.
 *
 * Docking: dragging a floating window until the pointer is at the left or right screen edge (or over a board
 * column) shows a preview and docks it on release; dragging a docked panel's header far enough lets it go and it
 * keeps moving under the pointer. On the grip an arrow key toward an edge the window touches docks it, and an
 * arrow away from the edge undocks a docked panel. A drag listens on the window, because docking moves the panel
 * to a new place in the page and the header it started on goes away.
 */
export function useHeaderMove(
  drawer: DrawerSize,
  panelRef: RefObject<HTMLDivElement | null>,
  ctl: DockControl,
  onPreview: (preview: DockPreview | null) => void,
) {
  type Drag = { x: number; y: number; pos: Pos; size: Size; last: Pos | null; docked: boolean; grab: { share: number; dy: number }; target: Dock };
  const drag = useRef<Drag | null>(null);
  const [moving, setMoving] = useState(false);
  const latest = useRef({ drawer, ctl, onPreview });
  latest.current = { drawer, ctl, onPreview };
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);

  const current = (): { pos: Pos; size: Size } => {
    const r = panelRef.current?.getBoundingClientRect();
    const { viewport } = drawer;
    const size = drawer.size ?? clampSize({ w: r?.width ?? MIN_W, h: r?.height ?? MIN_H }, viewport);
    const pos = drawer.pos ?? (r ? clampPos({ r: viewport.w - r.right, b: viewport.h - r.bottom }, size, viewport) : { r: 0, b: 0 });
    return { pos, size };
  };
  const onButton = (e: { target: EventTarget }) => Boolean((e.target as HTMLElement).closest("button:not(.lp-move)"));

  const previewFor = (side: DockSide): DockPreview => {
    const { ctl: c, drawer: dw } = latest.current;
    const col = c.inGame ? boardColumns()[side] : null;
    if (col) return { side, rect: { left: col.left, top: col.top, width: col.width, height: col.height } };
    const w = c.width;
    return { side, rect: { left: side === "left" ? 0 : dw.viewport.w - w, top: 0, width: w, height: dw.viewport.h } };
  };

  const onMove = (e: globalThis.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const { drawer: dw, ctl: c, onPreview: preview } = latest.current;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.docked) {
      if (!pulledLoose(dx, dy)) return;
      // Comes loose: the remembered window, held by the same spot of its header.
      const size = floatSize(dw.size, dw.viewport);
      const pos = looseAt({ x: e.clientX, y: e.clientY }, d.grab, size, dw.viewport);
      Object.assign(d, { docked: false, x: e.clientX, y: e.clientY, pos, size, last: pos });
      setMoving(true);
      dw.set(size);
      dw.setPos(pos);
      c.setDock(null);
      return;
    }
    if (!d.last && dx === 0 && dy === 0) return;
    setMoving(true);
    d.last = dragPos(d.pos, dx, dy, d.size, dw.viewport);
    dw.set(d.size);
    dw.setPos(d.last);
    const target = c.enabled ? dockAt(e.clientX, dw.viewport.w, c.inGame ? boardColumns() : undefined, c.inGame ? c.sides : undefined) : null;
    if (target !== d.target) {
      d.target = target;
      preview(target ? previewFor(target) : null);
    }
  };

  const end = () => {
    cleanup.current?.();
    const d = drag.current;
    drag.current = null;
    setMoving(false);
    const { drawer: dw, ctl: c, onPreview: preview } = latest.current;
    preview(null);
    if (!d || d.docked) return;
    if (d.target) {
      c.setDock(d.target);
      return;
    }
    if (!d.last) return;
    dw.commit(d.size);
    dw.commitPos(d.last);
  };

  return {
    moving,
    header: {
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        if (e.button !== 0 || onButton(e)) return;
        const { pos, size } = current();
        const r = panelRef.current?.getBoundingClientRect();
        drag.current = {
          x: e.clientX,
          y: e.clientY,
          pos,
          size,
          last: null,
          docked: ctl.dock !== null,
          grab: { share: r && r.width ? (e.clientX - r.left) / r.width : 0.5, dy: r ? e.clientY - r.top : 20 },
          target: null,
        };
        cleanup.current?.();
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", end);
        window.addEventListener("pointercancel", end);
        cleanup.current = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", end);
          window.removeEventListener("pointercancel", end);
          cleanup.current = null;
        };
      },
      onDoubleClick: (e: MouseEvent<HTMLElement>) => {
        if (onButton(e)) return;
        if (ctl.dock) {
          ctl.setDock(null);
          drawer.reset();
        }
        drawer.resetPos();
      },
    },
    grip: {
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
        const { pos, size } = current();
        const vp = drawer.viewport;
        const act = ctl.enabled || ctl.dock ? keyDock(ctl.dock, e.key, { left: pos.r + size.w >= vp.w, right: pos.r <= 0 }, ctl.inGame ? ctl.sides : undefined) : null;
        if (act === "undock") {
          e.preventDefault();
          const s = floatSize(drawer.size, vp);
          drawer.commit(s);
          drawer.commitPos(floatBeside(ctl.dock!, s, vp));
          ctl.setDock(null);
          return;
        }
        if (act) {
          e.preventDefault();
          ctl.setDock(act);
          return;
        }
        if (ctl.dock) return;
        const next = keyPos(pos, e.key, e.shiftKey, size, vp);
        if (!next) return;
        e.preventDefault();
        drawer.commit(size);
        drawer.commitPos(next);
      },
    },
  };
}

/** The inner edge of a panel docked to the screen edge: drag it, or use the arrow keys, to change the docked width. */
export function DockHandle({ side, width, onWidth, onCommit, onReset }: { side: DockSide; width: number; onWidth: (w: number) => void; onCommit: (w: number) => void; onReset: () => void }) {
  const drag = useRef<{ x: number; w: number } | null>(null);
  const next = (e: PointerEvent<HTMLDivElement>) => dragDockW(drag.current!.w, side, e.clientX - drag.current!.x, window.innerWidth);
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 64 : 16;
    // The arrow pointing away from the screen edge widens the panel, the one pointing at it narrows it.
    const away = side === "right" ? "ArrowLeft" : "ArrowRight";
    const toward = side === "right" ? "ArrowRight" : "ArrowLeft";
    if (e.key !== away && e.key !== toward) return;
    e.preventDefault();
    onCommit(clampDockW(width + (e.key === away ? step : -step), window.innerWidth));
  };
  return (
    <div
      className={`lp-resize lp-resize-dock lp-resize-dock-${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize docked Log Pose. Use the left and right arrow keys, or double-click to reset."
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, w: width };
      }}
      onPointerMove={(e) => {
        if (drag.current) onWidth(next(e));
      }}
      onPointerUp={(e) => {
        if (!drag.current) return;
        onCommit(next(e));
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onKeyDown={key}
      onDoubleClick={onReset}
    />
  );
}
