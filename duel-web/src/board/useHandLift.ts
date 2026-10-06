import { useEffect } from "react";
import { prefersReducedMotion } from "./BoardMotion";
import { liftScale, liftTilt } from "./handLift";

/** Last pointer position, so a lift that starts mid-gesture knows where the finger is. */
const lastPointer = { x: 0, y: 0, t: 0 };
if (typeof window !== "undefined") {
  window.addEventListener(
    "pointermove",
    (e) => {
      lastPointer.x = e.clientX;
      lastPointer.y = e.clientY;
      lastPointer.t = e.timeStamp;
    },
    { capture: true, passive: true },
  );
  window.addEventListener(
    "pointerdown",
    (e) => {
      lastPointer.x = e.clientX;
      lastPointer.y = e.clientY;
      lastPointer.t = e.timeStamp;
    },
    { capture: true, passive: true },
  );
}

function handEl(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-motion-id="${CSS.escape(id)}"]`);
}

/** The hand's visible area: the card row, clipped to its panel (as the drop slot measures it). */
function handArea(card: HTMLElement): DOMRect | null {
  const row = card.parentElement;
  if (!row) return null;
  const r = row.getBoundingClientRect();
  const panel = row.parentElement?.getBoundingClientRect();
  const pad = card.offsetHeight / 3;
  const left = Math.max(r.left, panel?.left ?? r.left) - pad;
  const right = Math.min(r.right, panel?.right ?? r.right) + pad;
  const top = Math.max(r.top, panel?.top ?? r.top) - pad;
  const bottom = Math.min(r.bottom, panel?.bottom ?? r.bottom) + pad;
  return new DOMRect(left, top, right - left, bottom - top);
}

/**
 * While `cardId` (a hand card) is dragged, a copy of it lifts out of the hand
 * and follows the pointer; DuelBoard empties the card's own slot (`card-lifted`) (#357). The copy is
 * the card as drawn, so the art, cost and Counter badges come with it. Over
 * the hand it is held a little bigger; elsewhere it shrinks to a carried
 * thumbnail so the board stays visible. Reduced motion keeps it upright.
 */
export function useHandLift(cardId: string | null) {
  useEffect(() => {
    if (!cardId || typeof document === "undefined") return;
    const card = handEl(cardId);
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const w = card.offsetWidth || rect.width;
    const h = card.offsetHeight || rect.height;
    // Where on the card it was grabbed, so it doesn't jump to centre under the pointer.
    const grabX = Math.max(-w / 2, Math.min(w / 2, lastPointer.x - (rect.left + rect.width / 2)));
    const grabY = Math.max(-h / 2, Math.min(h / 2, lastPointer.y - (rect.top + rect.height / 2)));

    const ghost = card.cloneNode(true) as HTMLElement;
    for (const el of [ghost, ...ghost.querySelectorAll<HTMLElement>("*")]) {
      el.removeAttribute("data-motion-id");
      el.removeAttribute("data-instance-id");
      el.removeAttribute("id");
      el.removeAttribute("tabindex");
    }
    ghost.classList.remove("card-lifted", "card-dragging", "selected", "hand-drop-before", "hand-drop-after");
    ghost.classList.add("hand-lift");
    ghost.setAttribute("aria-hidden", "true");
    ghost.setAttribute("inert", "");
    Object.assign(ghost.style, { width: `${w}px`, height: `${h}px`, transform: "none" });
    const layer = document.createElement("div");
    layer.className = "hand-lift-layer";
    layer.setAttribute("aria-hidden", "true");
    layer.appendChild(ghost);
    document.body.appendChild(layer);

    const still = prefersReducedMotion();
    let x = lastPointer.x;
    let y = lastPointer.y;
    let vx = 0;
    let lastT = lastPointer.t || performance.now();
    let tilt = 0;
    let frame = 0;
    const place = () => {
      frame = 0;
      const area = handArea(card);
      const over = area != null && x >= area.left && x <= area.right && y >= area.top && y <= area.bottom;
      const scale = liftScale(over, w);
      tilt = still ? 0 : tilt * 0.6 + liftTilt(vx) * 0.4;
      ghost.style.translate = `${(x - grabX * scale - w / 2).toFixed(1)}px ${(y - grabY * scale - h / 2).toFixed(1)}px`;
      ghost.style.scale = scale.toFixed(3);
      ghost.style.rotate = `${tilt.toFixed(2)}deg`;
      ghost.classList.toggle("is-carried", !over);
      // Let a lean settle back upright once the pointer stops.
      if (Math.abs(tilt) > 0.2) {
        vx *= 0.5;
        frame = requestAnimationFrame(place);
      }
    };
    const onMove = (e: PointerEvent) => {
      const dt = Math.max(1, e.timeStamp - lastT);
      vx = vx * 0.5 + ((e.clientX - x) / dt) * 0.5;
      lastT = e.timeStamp;
      x = e.clientX;
      y = e.clientY;
      if (!frame) frame = requestAnimationFrame(place);
    };
    place();
    window.addEventListener("pointermove", onMove, { capture: true, passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove, { capture: true });
      if (frame) cancelAnimationFrame(frame);
      layer.remove();
    };
  }, [cardId]);
}
