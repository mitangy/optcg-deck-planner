/**
 * Hiding a pop-up shrinks it into the "Back to …" pill (#587): the Hide click
 * records the pop-up's box and a copy of it, and the pill plays the flight once
 * it knows where it sits. Nothing is kept for pills that appear without a Hide.
 */

export type Box = { left: number; top: number; width: number; height: number };
type Capture = { box: Box; ghost: HTMLElement; host: Element; at: number };

/** A capture older than this belongs to a Hide whose pill never came. */
const FRESH_MS = 1000;
export const SHRINK_MS = 280;
const SHRINK_END_OPACITY = 0.15;
/** The pill pops in over the last stretch of the flight. */
const POP_DELAY_MS = 170;
const POP_MS = 140;
const GHOST_Z = 70;

let pending: Capture | null = null;

/**
 * Where a box at `from` must go to end up inside `to`: one uniform scale (so the pop-up
 * never squashes) that fits it into the pill, centred on the pill. With a top-left
 * transform origin, `x` / `y` are the translate for that scale.
 */
export function shrinkTransform(from: Box, to: Box): { x: number; y: number; scale: number } {
  const scale = Math.min(to.width / from.width, to.height / from.height);
  return {
    x: to.left + (to.width - from.width * scale) / 2 - from.left,
    y: to.top + (to.height - from.height * scale) / 2 - from.top,
    scale,
  };
}

function boxOf(r: DOMRect): Box {
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

export function motionReduced(): boolean {
  if (typeof document === "undefined") return true;
  return document.documentElement.dataset.motion === "reduce" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * Call from the Hide click, before the pop-up goes away. `box` is the visible pop-up (not
 * a full-screen wrapper around it); `context` is an ancestor whose class / variables its
 * CSS reads (the float layer), copied without its children so the clone still matches
 * those rules. The copy keeps its classes, so it is stripped of its dialog role and labels
 * to stay out of screen readers and role / label queries while it flies.
 */
export function captureHideShrink(box: Element | null, context?: Element | null): void {
  pending = null;
  if (!box || !(box instanceof HTMLElement) || motionReduced()) return;
  const rect = box.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return;
  const clone = box.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");
  for (const el of clone.querySelectorAll("[id]")) el.removeAttribute("id");
  clone.removeAttribute("role");
  for (const el of [clone, ...clone.querySelectorAll("[aria-label]")]) el.removeAttribute("aria-label");
  clone.inert = true;
  clone.setAttribute("aria-hidden", "true");
  // Pinned to its own corner at its on-screen size: the live pop-up's placement (centring,
  // drag offset, dodge) is not the clone's to repeat, but its size scale is.
  const cs = getComputedStyle(box);
  Object.assign(clone.style, {
    position: "absolute",
    left: "0",
    top: "0",
    right: "auto",
    bottom: "auto",
    margin: "0",
    translate: "none",
    transform: "none",
    transformOrigin: "0 0",
    scale: cs.scale,
    width: `${box.offsetWidth}px`,
    height: `${box.offsetHeight}px`,
    maxWidth: "none",
    maxHeight: "none",
    animation: "none",
  });
  let inner: HTMLElement = clone;
  if (context) {
    const shell = context.cloneNode(false) as HTMLElement;
    shell.removeAttribute("id");
    shell.removeAttribute("role");
    shell.removeAttribute("aria-label");
    shell.hidden = false;
    shell.style.display = "contents";
    shell.append(clone);
    inner = shell;
  }
  const ghost = document.createElement("div");
  ghost.className = "hide-shrink-ghost";
  ghost.setAttribute("aria-hidden", "true");
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    pointerEvents: "none",
    zIndex: String(GHOST_Z),
    transformOrigin: "0 0",
  });
  ghost.append(inner);
  pending = { box: boxOf(rect), ghost, host: box.closest(".arena") ?? document.body, at: performance.now() };
}

/** Fly the captured pop-up into `target` (the pill) and pop the pill in. No fresh capture: nothing happens. */
export function playHideShrink(target: HTMLElement): void {
  const cap = pending;
  pending = null;
  if (!cap || performance.now() - cap.at > FRESH_MS || motionReduced() || typeof cap.ghost.animate !== "function") return;
  const to = boxOf(target.getBoundingClientRect());
  if (to.width < 1 || to.height < 1) return;
  const { x, y, scale } = shrinkTransform(cap.box, to);
  cap.host.append(cap.ghost);
  const fly = cap.ghost.animate(
    [
      { transform: "translate(0px, 0px) scale(1)", opacity: 1 },
      { transform: `translate(${x}px, ${y}px) scale(${scale})`, opacity: SHRINK_END_OPACITY },
    ],
    { duration: SHRINK_MS, easing: "ease-in", fill: "forwards" },
  );
  const done = () => cap.ghost.remove();
  fly.onfinish = done;
  fly.oncancel = done;
  target.animate?.([{ scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1 }], {
    duration: POP_MS,
    delay: POP_DELAY_MS,
    easing: "ease-out",
    fill: "backwards",
  });
}
