import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { currentSettings } from "../settings";
import { prefersReducedMotion } from "./BoardMotion";
import { handShuffleSteps, type Pt, type ShuffleKind, type ShuffleStep } from "./handShuffle";
import { motionPlan, scaledMs } from "./motionSpeed";
import { playSfx } from "./sfx";

export const HAND_SHUFFLE_MS = {
  slide: 240,
  land: 320,
  riffle: 400,
  fade: 120,
} as const;

const EASE_OUT = "cubic-bezier(0.25, 0.7, 0.35, 1)";
/** Overshoots a touch, so the dropped card settles into its slot. */
const EASE_SETTLE = "cubic-bezier(0.3, 1.35, 0.5, 1)";

type Pending = {
  kind: ShuffleKind;
  before: Map<string, Pt>;
  landedId: string | null;
};

function handEl(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-motion-id="${CSS.escape(id)}"]`);
}

function centres(ids: readonly string[]): Map<string, Pt> {
  const out = new Map<string, Pt>();
  for (const id of ids) {
    const r = handEl(id)?.getBoundingClientRect();
    if (r && r.width > 0) out.set(id, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }
  return out;
}

function canAnimate(): boolean {
  return (
    typeof document !== "undefined" &&
    !document.hidden &&
    typeof Element !== "undefined" &&
    typeof Element.prototype.animate === "function"
  );
}

/**
 * Animates your hand when you rearrange it. Call `capture` right before the
 * state change that reorders the hand (it measures where every card is);
 * `idsRef` holds the hand's display order as of the latest render. The
 * next commit draws each card from there to its new spot. Off with "Card
 * animations: Off"; reduced motion only fades the dropped card in; Sounds
 * adds a soft tap on a drop and a riffle on Sort.
 */
export function useHandShuffle(idsRef: RefObject<readonly string[]>, opts: { sound: boolean }) {
  const pending = useRef<Pending | null>(null);
  const soundRef = useRef(opts.sound);
  soundRef.current = opts.sound;
  const running = useRef(new Set<Animation>());

  const finishAll = useCallback(() => {
    for (const a of [...running.current]) {
      try {
        a.finish();
      } catch {
        a.cancel();
      }
    }
    running.current.clear();
  }, []);

  // A new press measures the hand (drop slots, drags), so nothing may still be in flight.
  useEffect(() => {
    window.addEventListener("pointerdown", finishAll, true);
    return () => {
      window.removeEventListener("pointerdown", finishAll, true);
      finishAll();
    };
  }, [finishAll]);

  const capture = useCallback(
    (kind: ShuffleKind, drop?: { cardId: string; x: number; y: number }) => {
      if (!canAnimate() || motionPlan(currentSettings().animationSpeed, false).mode === "off") {
        pending.current = null;
        return;
      }
      finishAll();
      const before = centres(idsRef.current);
      if (drop) before.set(drop.cardId, { x: drop.x, y: drop.y });
      pending.current = { kind, before, landedId: drop?.cardId ?? null };
    },
    [finishAll],
  );

  // Every commit: runs once the reorder captured above is on screen.
  useLayoutEffect(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    const plan = motionPlan(currentSettings().animationSpeed, prefersReducedMotion());
    if (plan.mode === "off") return;
    const ids = idsRef.current;
    const after = centres(ids);
    const first = ids.map(handEl).find((el) => el != null && el.offsetHeight > 0);
    // A grid hand sits in a scrolling box that would clip a full hop: keep its arc low.
    const height = (first?.offsetHeight ?? 0) * (first?.parentElement?.classList.contains("hand-fan-cards") ? 1 : 0.4);
    const steps = handShuffleSteps(p.kind, p.before, after, ids, { cardHeight: height, landedId: p.landedId });
    if (steps.length === 0) return;
    if (soundRef.current) playSfx([p.kind === "sort" ? "riffle" : "tuck"]);
    const track = (a: Animation) => {
      running.current.add(a);
      const done = () => running.current.delete(a);
      a.onfinish = done;
      a.oncancel = done;
    };
    for (const step of steps) {
      const el = handEl(step.id);
      if (!el) continue;
      try {
        if (plan.mode === "fade") {
          if (step.landing) {
            track(el.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: HAND_SHUFFLE_MS.fade, easing: "linear" }));
          }
          continue;
        }
        track(animateStep(el, step, plan.scale));
      } catch {
        // Motion is decoration: a missing element never breaks the hand.
      }
    }
  });

  return capture;
}

function animateStep(el: HTMLElement, s: ShuffleStep, scale: number): Animation {
  const from = `${s.dx.toFixed(1)}px ${s.dy.toFixed(1)}px`;
  if (s.landing) {
    return el.animate(
      [
        { translate: from, scale: "1.14", zIndex: 6 },
        { translate: "0 0", scale: "0.97", zIndex: 6, offset: 0.72 },
        { translate: "0 0", scale: "1", zIndex: 6 },
      ],
      { duration: scaledMs(HAND_SHUFFLE_MS.land, scale), easing: EASE_SETTLE, fill: "backwards" },
    );
  }
  if (s.lift === 0 && s.tilt === 0) {
    return el.animate([{ translate: from }, { translate: "0 0" }], {
      duration: scaledMs(HAND_SHUFFLE_MS.slide, scale),
      delay: scaledMs(s.delay, scale),
      easing: EASE_OUT,
      fill: "backwards",
    });
  }
  const mid = `${(s.dx / 2).toFixed(1)}px ${(s.dy / 2 + s.lift).toFixed(1)}px`;
  return el.animate(
    [
      { translate: from, rotate: "0deg", zIndex: 5 },
      { translate: mid, rotate: `${s.tilt}deg`, zIndex: 5, offset: 0.45 },
      { translate: "0 0", rotate: "0deg", zIndex: 5 },
    ],
    {
      duration: scaledMs(HAND_SHUFFLE_MS.riffle, scale),
      delay: scaledMs(s.delay, scale),
      easing: "ease-in-out",
      fill: "backwards",
    },
  );
}
