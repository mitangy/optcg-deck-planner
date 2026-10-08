import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type RefObject } from "react";
import { clampPos, dragPos, keyPos, readPos, roomAt, writePos, type Pos } from "./panelPos";
import { clampSheet, clampSize, dragSheet, dragSize, keySize, maxSize, MIN_H, MIN_W, readSheet, readSize, writeSheet, writeSize, type Edge, type Size } from "./panelSize";

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
  top: "Resize Log Pose taller or shorter. Use the up and down arrow keys, or double-click to reset.",
  left: "Resize Log Pose wider or narrower. Use the left and right arrow keys, or double-click to reset.",
  corner: "Resize Log Pose from its corner. Use the arrow keys, or double-click to reset.",
};

function Handle({ edge, drawer, panelRef }: { edge: Edge; drawer: DrawerSize; panelRef: RefObject<HTMLDivElement | null> }) {
  const drag = useRef<{ x: number; y: number; size: Size } | null>(null);
  const measure = (): Size => {
    const r = panelRef.current?.getBoundingClientRect();
    return r ? { w: Math.round(r.width), h: Math.round(r.height) } : { w: MIN_W, h: MIN_H };
  };
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, size: drawer.size ?? measure() };
  };
  const next = (e: PointerEvent<HTMLDivElement>) => dragSize(drag.current!.size, edge, e.clientX - drag.current!.x, e.clientY - drag.current!.y, drawer.vp);
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current) drawer.set(next(e));
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drawer.commit(next(e));
    drag.current = null;
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const size = keySize(drawer.size ?? measure(), edge, e.key, e.shiftKey, drawer.vp);
    if (!size) return;
    e.preventDefault();
    drawer.commit(size);
  };
  const max = maxSize(drawer.vp);
  const now = edge === "top" ? (drawer.size?.h ?? drawer.vp.h) : edge === "left" ? (drawer.size?.w ?? Math.min(420, drawer.vp.w)) : undefined;
  return (
    <div
      className={`lp-resize lp-resize-${edge}`}
      role="separator"
      aria-orientation={edge === "top" ? "horizontal" : edge === "left" ? "vertical" : undefined}
      aria-label={LABELS[edge]}
      aria-valuenow={now}
      aria-valuemin={edge === "top" ? MIN_H : edge === "left" ? MIN_W : undefined}
      aria-valuemax={edge === "top" ? max.h : edge === "left" ? max.w : undefined}
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

/** Drag handles on the panel's top edge, left edge and top-left corner. */
export function ResizeHandles({ drawer, panelRef }: { drawer: DrawerSize; panelRef: RefObject<HTMLDivElement | null> }) {
  return (
    <>
      <Handle edge="top" drawer={drawer} panelRef={panelRef} />
      <Handle edge="left" drawer={drawer} panelRef={panelRef} />
      <Handle edge="corner" drawer={drawer} panelRef={panelRef} />
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

/**
 * Moving the desktop panel: drag its header (anywhere that isn't a button) or use the arrow keys on the move grip;
 * double-click the header to put it back in the corner. The first move gives the default drawer an explicit size,
 * since a window that moves can't also be as tall as the screen.
 */
export function useHeaderMove(drawer: DrawerSize, panelRef: RefObject<HTMLDivElement | null>) {
  const drag = useRef<{ x: number; y: number; pos: Pos; size: Size; last: Pos | null } | null>(null);
  const current = (): { pos: Pos; size: Size } => {
    const r = panelRef.current?.getBoundingClientRect();
    const { viewport } = drawer;
    const size = drawer.size ?? clampSize({ w: r?.width ?? MIN_W, h: r?.height ?? MIN_H }, viewport);
    const pos = drawer.pos ?? (r ? clampPos({ r: viewport.w - r.right, b: viewport.h - r.bottom }, size, viewport) : { r: 0, b: 0 });
    return { pos, size };
  };
  const onButton = (e: { target: EventTarget }) => Boolean((e.target as HTMLElement).closest("button:not(.lp-move)"));
  const end = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (panelRef.current) delete panelRef.current.dataset.moving;
    if (!d.last) return;
    drawer.commit(d.size);
    drawer.commitPos(d.last);
  };
  return {
    header: {
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        if (e.button !== 0 || onButton(e)) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const { pos, size } = current();
        drag.current = { x: e.clientX, y: e.clientY, pos, size, last: null };
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        if (!d.last && dx === 0 && dy === 0) return;
        if (!d.last && panelRef.current) panelRef.current.dataset.moving = "true";
        d.last = dragPos(d.pos, dx, dy, d.size, drawer.viewport);
        drawer.set(d.size);
        drawer.setPos(d.last);
      },
      onPointerUp: end,
      onPointerCancel: end,
      onDoubleClick: (e: MouseEvent<HTMLElement>) => {
        if (!onButton(e)) drawer.resetPos();
      },
    },
    grip: {
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
        const { pos, size } = current();
        const next = keyPos(pos, e.key, e.shiftKey, size, drawer.viewport);
        if (!next) return;
        e.preventDefault();
        drawer.commit(size);
        drawer.commitPos(next);
      },
    },
  };
}
