import { useCallback, useEffect, useRef, useState } from "react";
import { fanPosForDrop, nudgeFanPos, type FanPos } from "./handFanPos";

type Move = {
  /** Pointer offset from the fan's bottom-centre point when the drag began. */
  dx: number;
  dy: number;
  /** Live spot while dragging (share of the window). */
  pos: FanPos;
  /** Pointer offset from the grip's centre when grabbed (anchored drags). */
  grab?: { x: number; y: number };
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
  /** Where a drop lands (viewport px: centre x, bottom, the fan's height); the player's fan snaps to the bottom edge by default. */
  dropTo?: (centreX: number, bottom: number, height: number, vp: { width: number; height: number }) => FanPos | null,
  opts: {
    /** While docked (no saved spot), measure from this child (the cards): the docked spectator strip is wider than the fan. */
    bodySelector?: string;
    /** Keep the grip under the pointer: its spot differs between the docked strip and the floating fan. */
    anchorGrip?: boolean;
  } = {},
) {
  const { bodySelector, anchorGrip = false } = opts;
  const [move, setMove] = useState<Move | null>(null);
  const moveRef = useRef<Move | null>(null);
  moveRef.current = move;
  const latest = useRef({ onChange, defaultCentreX, dropTo });
  latest.current = { onChange, defaultCentreX, dropTo };
  const bodyRect = useCallback((): DOMRect | null => {
    const el = fanRef.current;
    if (!el) return null;
    const body = bodySelector && pos == null ? el.querySelector(bodySelector) : null;
    return (body ?? el).getBoundingClientRect();
  }, [fanRef, bodySelector, pos]);

  const moving = move != null;
  // Would letting go now put the fan back at its default spot?
  let willDock = false;
  if (move) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const height = bodyRect()?.height ?? 0;
    const to = move.pos;
    const drop = latest.current.dropTo;
    willDock =
      (drop
        ? drop(to.x * w, to.y * h, height, { width: w, height: h })
        : fanPosForDrop(to.x * w, to.y * h, { width: w, height: h }, latest.current.defaultCentreX())) == null;
  }
  useEffect(() => {
    if (!moving) return;
    const vp = () => ({ width: window.innerWidth, height: window.innerHeight });
    const at = (e: PointerEvent): FanPos => {
      const m = moveRef.current!;
      const { width, height } = vp();
      return { x: (e.clientX - m.dx) / width, y: (e.clientY - m.dy) / height };
    };
    // Anchored: move the fan by however far the grip is from where the pointer holds it.
    const place = (e: PointerEvent): FanPos => {
      const m = moveRef.current!;
      const fan = fanRef.current;
      const grip = anchorGrip && m.grab ? fan?.querySelector(".hand-fan-grip") : null;
      if (!fan || !grip) return at(e);
      const f = fan.getBoundingClientRect();
      const g = grip.getBoundingClientRect();
      const { width, height } = vp();
      return {
        x: (f.left + f.width / 2 + (e.clientX - m.grab!.x) - (g.left + g.width / 2)) / width,
        y: (f.bottom + (e.clientY - m.grab!.y) - (g.top + g.height / 2)) / height,
      };
    };
    const onMove = (e: PointerEvent) => setMove((m) => (m ? { ...m, pos: place(e) } : m));
    const onUp = (e: PointerEvent) => {
      const p = place(e);
      const { width, height } = vp();
      setMove(null);
      const { dropTo: drop, defaultCentreX: centre, onChange: save } = latest.current;
      const h = bodyRect()?.height ?? 0;
      save(
        drop
          ? drop(p.x * width, p.y * height, h, vp())
          : fanPosForDrop(p.x * width, p.y * height, vp(), centre()),
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
  }, [moving, fanRef, bodyRect, anchorGrip]);

  const startPos = useCallback((): FanPos | null => {
    const r = bodyRect();
    if (!r) return null;
    return {
      x: (r.left + r.width / 2) / window.innerWidth,
      y: Math.min(r.bottom, window.innerHeight) / window.innerHeight,
    };
  }, [bodyRect]);

  const gripProps = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const start = startPos();
      if (!start) return;
      e.preventDefault();
      e.stopPropagation();
      const g = e.currentTarget.getBoundingClientRect();
      setMove({
        dx: e.clientX - start.x * window.innerWidth,
        dy: e.clientY - start.y * window.innerHeight,
        pos: start,
        grab: { x: e.clientX - (g.left + g.width / 2), y: e.clientY - (g.top + g.height / 2) },
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

  return { livePos: move?.pos ?? null, willDock, gripProps };
}
