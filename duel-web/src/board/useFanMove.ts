import { useCallback, useEffect, useRef, useState } from "react";
import { fanPosForDrop, nudgeFanPos, type FanPos } from "./handFanPos";

type Move = {
  /** Pointer offset from the fan's bottom-centre point when the drag began. */
  dx: number;
  dy: number;
  /** Live spot while dragging (share of the window). */
  pos: FanPos;
};

/**
 * Drag the desktop fanned hand by its grip. The fan follows the pointer and
 * floats fully shown while you drag; on drop the spot is saved (snapping onto
 * the bottom edge, or back to the default spot near it). Esc cancels.
 * `defaultCentreX` gives the default spot's centre (the board column's middle).
 */
export function useFanMove(
  fanRef: React.RefObject<HTMLElement | null>,
  pos: FanPos | null,
  onChange: (next: FanPos | null) => void,
  defaultCentreX: () => number,
) {
  const [move, setMove] = useState<Move | null>(null);
  const moveRef = useRef<Move | null>(null);
  moveRef.current = move;
  const latest = useRef({ onChange, defaultCentreX });
  latest.current = { onChange, defaultCentreX };

  const moving = move != null;
  useEffect(() => {
    if (!moving) return;
    const vp = () => ({ width: window.innerWidth, height: window.innerHeight });
    const at = (e: PointerEvent): FanPos => {
      const m = moveRef.current!;
      const { width, height } = vp();
      return { x: (e.clientX - m.dx) / width, y: (e.clientY - m.dy) / height };
    };
    const onMove = (e: PointerEvent) => setMove((m) => (m ? { ...m, pos: at(e) } : m));
    const onUp = (e: PointerEvent) => {
      const p = at(e);
      const { width, height } = vp();
      setMove(null);
      latest.current.onChange(
        fanPosForDrop(p.x * width, p.y * height, vp(), latest.current.defaultCentreX()),
      );
    };
    const onCancel = () => setMove(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setMove(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey, true);
    document.body.classList.add("is-panel-drag");
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey, true);
      document.body.classList.remove("is-panel-drag");
    };
  }, [moving]);

  const startPos = useCallback((): FanPos | null => {
    const el = fanRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: (r.left + r.width / 2) / window.innerWidth,
      y: Math.min(r.bottom, window.innerHeight) / window.innerHeight,
    };
  }, [fanRef]);

  const gripProps = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const start = startPos();
      if (!start) return;
      e.preventDefault();
      e.stopPropagation();
      setMove({
        dx: e.clientX - start.x * window.innerWidth,
        dy: e.clientY - start.y * window.innerHeight,
        pos: start,
      });
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      const dir = (
        { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" } as const
      )[e.key as "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight"];
      if (!dir) return;
      e.preventDefault();
      e.stopPropagation();
      const from = pos ?? startPos();
      if (from) latest.current.onChange(nudgeFanPos(from, dir));
    },
  };

  return { livePos: move?.pos ?? null, gripProps };
}
