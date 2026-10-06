import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { clampSheet, clampSize, dragSheet, dragSize, keySize, maxSize, MIN_H, MIN_W, readSheet, readSize, writeSheet, writeSize, type Edge, type Size } from "./panelSize";

const viewportSize = (): Size => ({ w: window.innerWidth, h: window.innerHeight });

/** The desktop panel's remembered size, kept inside the window as the window changes. Null while it has its default (full-height drawer) size. */
export function useDrawerSize() {
  const [stored, setStored] = useState<Size | null>(() => readSize());
  const [vp, setVp] = useState<Size>(viewportSize);
  useEffect(() => {
    const on = () => setVp(viewportSize());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  // Clamped when drawn, never in storage: a window that grows again gives the remembered size back.
  const size = stored ? clampSize(stored, vp) : null;
  return {
    size,
    vp,
    set: setStored,
    commit: useCallback((s: Size) => {
      setStored(s);
      writeSize(s);
    }, []),
    reset: useCallback(() => {
      setStored(null);
      writeSize(null);
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
