import { useEffect, useRef } from "react";

/** Pointer travel (px) that counts as "dragging it to attack", not a tap. */
export const ATTEMPT_DRAG_PX = 12;

export type AttackAttempt = { id: string; reason: string };

function tileId(target: EventTarget | null, sideClass: "side-you" | "side-opp"): string | null {
  const el = (target as Element | null)?.closest?.(`.${sideClass} [data-instance-id]`);
  return el?.getAttribute("data-instance-id") ?? null;
}

/**
 * Catches the two ways a player tries to attack with a card that can't:
 *  1. press one of your own cards and drag it (>= ATTEMPT_DRAG_PX), the way a
 *     legal attack starts; or
 *  2. with such a card selected, tap one of the opponent's cards.
 * A plain tap only selects (abilities, DON!!), so it never warns. `reasonFor`
 * returns the reason or null for a card that may attack / isn't an attacker.
 */
export function useAttackAttempt(opts: {
  enabled: boolean;
  reasonFor: (id: string) => string | null;
  selectedId: string | null;
  onAttempt: (a: AttackAttempt) => void;
}): void {
  const ref = useRef(opts);
  ref.current = opts;
  useEffect(() => {
    if (!opts.enabled) return;
    let press: { id: string; x: number; y: number; pointerId: number; reason: string } | null = null;
    let lastAt = 0;
    const fire = (a: AttackAttempt) => {
      const now = Date.now();
      if (now - lastAt < 500) return;
      lastAt = now;
      ref.current.onAttempt(a);
    };
    const down = (e: PointerEvent) => {
      press = null;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const id = tileId(e.target, "side-you");
      const reason = id ? ref.current.reasonFor(id) : null;
      if (id && reason) press = { id, reason, x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    };
    const move = (e: PointerEvent) => {
      if (!press || press.pointerId !== e.pointerId) return;
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < ATTEMPT_DRAG_PX) return;
      const p = press;
      press = null;
      fire({ id: p.id, reason: p.reason });
    };
    const end = () => {
      press = null;
    };
    const click = (e: MouseEvent) => {
      const sel = ref.current.selectedId;
      if (!sel || !tileId(e.target, "side-opp")) return;
      const reason = ref.current.reasonFor(sel);
      if (reason) fire({ id: sel, reason });
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", end, true);
    document.addEventListener("pointercancel", end, true);
    document.addEventListener("click", click, true);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", end, true);
      document.removeEventListener("pointercancel", end, true);
      document.removeEventListener("click", click, true);
    };
  }, [opts.enabled]);
}
