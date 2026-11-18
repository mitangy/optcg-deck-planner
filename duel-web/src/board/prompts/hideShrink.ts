export type Box = { left: number; top: number; width: number; height: number };
type Capture = { box: Box; ghost: HTMLElement; host: Element; at: number };

const FRESH_MS = 1000;
export const SHRINK_MS = 280;
const SHRINK_END_OPACITY = 0.15;
const POP_DELAY_MS = 170;
const POP_MS = 140;
const GHOST_Z = 70;

let pending: Capture | null = null;

// One uniform scale, so the pop-up never squashes.
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

function copyLook(from: Element, to: Element): void {
  if (from instanceof HTMLElement && to instanceof HTMLElement) {
    const cs = getComputedStyle(from);
    for (let i = 0; i < cs.length; i++) {
      const prop = cs.item(i);
      if (prop.startsWith("animation") || prop.startsWith("transition")) continue;
      to.style.setProperty(prop, cs.getPropertyValue(prop));
    }
  }
  for (const attr of ["class", "id", "role", "aria-label", "aria-labelledby", "aria-describedby", "data-testid"]) to.removeAttribute(attr);
  const a = from.children;
  const b = to.children;
  for (let i = 0; i < a.length && i < b.length; i++) copyLook(a[i], b[i]);
}

// `box` is the visible pop-up, not a full-screen wrapper around it.
export function captureHideShrink(box: Element | null): void {
  pending = null;
  if (!box || !(box instanceof HTMLElement) || motionReduced()) return;
  const rect = box.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return;
  const clone = box.cloneNode(true) as HTMLElement;
  copyLook(box, clone);
  clone.inert = true;
  clone.setAttribute("aria-hidden", "true");
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
    width: `${box.offsetWidth}px`,
    height: `${box.offsetHeight}px`,
    maxWidth: "none",
    maxHeight: "none",
    animation: "none",
    transition: "none",
  });
  const inner: HTMLElement = clone;
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
