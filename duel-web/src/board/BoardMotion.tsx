/**
 * Card motion layer: shuffle, draw, play, life, KO / discard, DON!! and power
 * cues drawn with the Web Animations API on top of an already-updated board.
 *
 * - Never gates input: the view is on screen before anything moves, ghosts
 *   ignore the pointer, and any pointer or key press finishes every running
 *   animation at once.
 * - Transform (`translate` / `scale`) and opacity only, FLIP style: measure
 *   where a card was, measure where it is now, animate the difference. The
 *   individual `translate` / `scale` properties compose with each tile's own
 *   `transform` (rested rotation, hand fan) instead of replacing it.
 * - Reduced motion (OS or the "Reduce animations" setting): no travel, only a
 *   short fade on the cards that arrived.
 *
 * Class component for `getSnapshotBeforeUpdate`: it runs after React renders
 * the new view but before the DOM changes, which is the only moment the old
 * positions (a hand card about to be played, a Character about to be KO'd)
 * can still be measured.
 */
import { Component } from "react";
import type { PlayerView } from "../net/protocol";
import { currentSettings } from "../settings";
import { motionCues, type MotionCue, type MotionSide } from "./motionCues";
import { motionPlan, scaledMs } from "./motionSpeed";

type Props = { view: PlayerView | null };

/** Old positions and art captured before the DOM update. */
type Snapshot = {
  cues: MotionCue[];
  handRects: Map<string, DOMRect>;
  leaving: Map<string, Leaving>;
};

/** A card that left the DOM: where it was and what its art looked like. */
type Leaving = { rect: DOMRect; art: string | null; rested: boolean };

export const MOTION_MS = {
  shuffle: 420,
  draw: 300,
  play: 280,
  life: 320,
  pile: 360,
  leave: 300,
  don: 220,
  power: 240,
  fade: 120,
} as const;

// Gentle deceleration: a front-loaded curve would park the card at its target for most of the flight.
const EASE_OUT = "cubic-bezier(0.25, 0.7, 0.35, 1)";
const EASE_IN = "cubic-bezier(0.55, 0, 0.9, 0.4)";
/** Draw flip: the back starts turning at 45% of the flight and is edge-on at 70%. */
const FLIP_START = 0.45;
const FLIP_MID = 0.7;

export function prefersReducedMotion(): boolean {
  if (typeof document === "undefined") return true;
  if (document.documentElement.dataset.motion === "reduce") return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

export class BoardMotion extends Component<Props> {
  private running = new Set<Animation>();
  private layer: HTMLDivElement | null = null;
  /** Speed multiplier for the batch being played (Fast halves every duration). */
  private scale = 1;

  componentDidMount() {
    window.addEventListener("pointerdown", this.finishAll, true);
    window.addEventListener("keydown", this.finishAll, true);
    if (this.props.view) this.play(motionCues(null, this.props.view), emptySnapshot());
  }

  componentWillUnmount() {
    window.removeEventListener("pointerdown", this.finishAll, true);
    window.removeEventListener("keydown", this.finishAll, true);
    this.finishAll();
    this.layer?.remove();
    this.layer = null;
  }

  getSnapshotBeforeUpdate(prevProps: Props): Snapshot | null {
    const next = this.props.view;
    if (!next || prevProps.view === next || !canAnimate() || currentPlan().mode === "off") return null;
    const cues = motionCues(prevProps.view, next);
    if (cues.length === 0) return null;
    const snap = emptySnapshot();
    snap.cues = cues;
    for (const cue of cues) {
      if ((cue.kind === "play" && cue.fromHand && cue.side === "you") || cue.kind === "discard") {
        const el = handCard(cue.id);
        if (el) snap.handRects.set(cue.id, el.getBoundingClientRect());
      }
      if (cue.kind === "discard" || cue.kind === "leave_field") {
        const el = cue.kind === "discard" ? handCard(cue.id) : fieldTile(cue.side, cue.id);
        if (el) {
          const img = el.querySelector("img");
          snap.leaving.set(cue.id, {
            rect: el.getBoundingClientRect(),
            art: img?.currentSrc || img?.src || null,
            rested: el.classList.contains("rested"),
          });
        }
      }
    }
    return snap;
  }

  componentDidUpdate(_prev: Props, _state: unknown, snap: Snapshot | null) {
    if (snap) this.play(snap.cues, snap);
  }

  render() {
    return null;
  }

  private finishAll = () => {
    for (const a of [...this.running]) {
      try {
        a.finish();
      } catch {
        a.cancel();
      }
    }
    this.running.clear();
  };

  private track(a: Animation | null, cleanup?: () => void) {
    if (!a) {
      cleanup?.();
      return;
    }
    this.running.add(a);
    const done = () => {
      this.running.delete(a);
      cleanup?.();
    };
    a.onfinish = done;
    a.oncancel = done;
  }

  private ghostLayer(): HTMLDivElement {
    if (this.layer?.isConnected) return this.layer;
    const el = document.createElement("div");
    el.className = "motion-layer";
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
    this.layer = el;
    return el;
  }

  /** A fixed-position element sized to `rect`; removed when its animation ends. */
  private ghost(rect: DOMRect, node: HTMLElement): HTMLElement {
    node.classList.add("motion-ghost");
    node.removeAttribute("data-instance-id");
    node.removeAttribute("data-motion-id");
    Object.assign(node.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    this.ghostLayer().appendChild(node);
    return node;
  }

  private play(cues: MotionCue[], snap: Snapshot) {
    if (cues.length === 0 || !canAnimate()) return;
    const plan = currentPlan();
    if (plan.mode === "off") return;
    this.scale = plan.mode === "move" ? plan.scale : 1;
    for (const cue of cues) {
      try {
        if (plan.mode === "fade") this.fadeCue(cue);
        else this.moveCue(cue, snap);
      } catch {
        // Motion is decoration: a missing element never breaks the board.
      }
    }
  }

  /** A base duration or delay at this batch's speed. */
  private ms(base: number): number {
    return scaledMs(base, this.scale);
  }

  /** Reduced motion: arrivals fade in place, nothing travels. */
  private fadeCue(cue: MotionCue) {
    const fade = (el: Element | null) => {
      if (!el) return;
      this.track(
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOTION_MS.fade, easing: "linear" }),
      );
    };
    if (cue.kind === "draw" || cue.kind === "life_to_hand") cue.ids.forEach((id) => fade(handCard(id)));
    if (cue.kind === "play") fade(fieldTile(cue.side, cue.id));
    if (cue.kind === "don") donChips(cue.side, cue.count, cue.activeAfter).forEach(fade);
  }

  private moveCue(cue: MotionCue, snap: Snapshot) {
    switch (cue.kind) {
      case "shuffle":
        return this.shuffle(cue.side);
      case "draw":
      case "life_to_hand":
        return this.toHand(cue.side, cue.kind === "draw" ? "deck" : "life", cue.count, cue.ids);
      case "life_lost":
      case "life_gained":
        return this.pilePulse(cue.side, cue.kind === "life_lost");
      case "play":
        return this.playToField(cue.side, cue.id, cue.fromHand, snap.handRects.get(cue.id));
      case "leave_field":
      case "discard": {
        const left = snap.leaving.get(cue.id);
        if (left) this.toTrash(cue.side, left, cue.kind === "discard" || cue.toTrash);
        return;
      }
      case "don":
        return this.donArrive(cue.side, cue.count, cue.activeAfter);
      case "power":
        return this.powerPop(cue.side, cue.id, cue.up);
    }
  }

  private shuffle(side: MotionSide) {
    const faces = [...(pile(side, "deck")?.querySelectorAll<HTMLElement>(".zone-pile-face") ?? [])];
    faces.forEach((face, i) => {
      const dir = i % 2 === 0 ? -1 : 1;
      const d = 7 + i * 2;
      this.track(
        face.animate(
          [
            { translate: "0 0", rotate: "0deg" },
            { translate: `${dir * d}px -2px`, rotate: `${dir * 4}deg`, offset: 0.2 },
            { translate: `${-dir * d}px 0`, rotate: `${-dir * 3}deg`, offset: 0.45 },
            { translate: `${dir * (d - 3)}px -1px`, rotate: `${dir * 2}deg`, offset: 0.7 },
            { translate: "0 0", rotate: "0deg" },
          ],
          { duration: this.ms(MOTION_MS.shuffle), easing: "ease-in-out" },
        ),
      );
    });
  }

  /** Deck or life → hand. Yours flip face-up in flight; the opponent's stay face-down. */
  private toHand(side: MotionSide, from: "deck" | "life", count: number, ids: string[]) {
    const source = pile(side, from);
    if (!source) return;
    const src = sourceRect(source);
    const art = cardBackArt(source);
    const step = this.ms(staggerMs(count));
    if (side === "you" && ids.length > 0) {
      ids.forEach((id, i) => {
        const el = handCard(id);
        const target = el && visible(el.getBoundingClientRect()) ? el : handZone();
        if (!target) return;
        const to = target.getBoundingClientRect();
        this.flyBack(src, to, art, i * step, target === el);
        if (target === el) this.flipIn(el, src, i * step);
      });
      return;
    }
    const target = side === "you" ? handZone() : oppHand();
    if (!target) return;
    const to = shrinkTo(target.getBoundingClientRect(), src);
    for (let i = 0; i < Math.min(count, 5); i += 1) this.flyBack(src, to, art, i * step, false);
  }

  /**
   * A card back travelling `from → to`. With `flip` it turns edge-on part way
   * (the real card then widens face-up in its place, see `flipIn`); without,
   * it fades as it reaches the target.
   */
  private flyBack(from: DOMRect, to: DOMRect, art: string, delay: number, flip: boolean) {
    const node = document.createElement("div");
    node.className = "card-back";
    if (art) node.style.setProperty("--card-back-art", art);
    const g = this.ghost(to, node);
    const d = delta(from, to);
    const frames: Keyframe[] = flip
      ? [
          flightFrame(d, 0, 1),
          flightFrame(d, FLIP_START, 1),
          flightFrame(d, FLIP_MID, 0),
          { ...flightFrame(d, 1, 0), opacity: 0 },
        ]
      : [
          { ...flightFrame(d, 0, 1), opacity: 1 },
          { ...flightFrame(d, 0.75, 1), opacity: 1 },
          { ...flightFrame(d, 1, 1), opacity: 0 },
        ];
    this.track(
      g.animate(frames, { duration: this.ms(MOTION_MS.draw), delay, easing: EASE_OUT, fill: "both" }),
      () => g.remove(),
    );
  }

  /** The real hand card rides the same path, hidden edge-on until the back has turned, then widens. */
  private flipIn(el: Element, from: DOMRect, delay: number) {
    const d = delta(from, el.getBoundingClientRect());
    this.track(
      el.animate([flightFrame(d, 0, 0), flightFrame(d, FLIP_MID, 0), flightFrame(d, 1, 1)], {
        duration: this.ms(MOTION_MS.draw),
        delay,
        easing: EASE_OUT,
        fill: "backwards",
      }),
    );
  }

  private pilePulse(side: MotionSide, lost: boolean) {
    const el = pile(side, "life");
    if (!el) return;
    const glow = lost ? "rgba(230, 70, 70, 0.9)" : "rgba(240, 200, 90, 0.9)";
    this.track(
      el.animate(
        [
          { scale: "1", filter: "none" },
          { scale: lost ? "0.92" : "1.06", filter: `drop-shadow(0 0 10px ${glow})`, offset: 0.35 },
          { scale: "1", filter: "none" },
        ],
        { duration: this.ms(MOTION_MS.pile), easing: "ease-out" },
      ),
    );
  }

  private playToField(side: MotionSide, id: string, fromHand: boolean, handRect?: DOMRect) {
    const el = fieldTile(side, id);
    if (!el) return;
    let from: DOMRect | null = null;
    if (fromHand && side === "you") {
      from = handRect && visible(handRect) ? handRect : (handZone()?.getBoundingClientRect() ?? null);
    } else if (fromHand) {
      from = oppHand()?.getBoundingClientRect() ?? null;
    }
    const to = el.getBoundingClientRect();
    if (!from || !visible(from)) {
      // Played from somewhere we can't point at (deck, trash, effect): grow in place.
      this.track(
        el.animate(
          [{ scale: "0.85", opacity: 0 }, { scale: "1.04", opacity: 1, offset: 0.75 }, { scale: "1" }],
          { duration: this.ms(MOTION_MS.play), easing: EASE_OUT },
        ),
      );
      return;
    }
    const d = delta(shrinkTo(from, to), to);
    this.track(
      el.animate(
        [
          { translate: `${d.dx}px ${d.dy}px`, scale: `${d.s}`, opacity: side === "opp" ? 0.4 : 1 },
          { translate: "0 0", scale: "1.05", opacity: 1, offset: 0.8 },
          { translate: "0 0", scale: "1" },
        ],
        { duration: this.ms(MOTION_MS.play), easing: EASE_OUT },
      ),
    );
  }

  /** A copy of the card that left drifts into the trash (or just fades if it went elsewhere). */
  private toTrash(side: MotionSide, left: Leaving, toTrash: boolean) {
    const node = left.art ? document.createElement("img") : document.createElement("div");
    if (node instanceof HTMLImageElement && left.art) node.src = left.art;
    else node.className = "card-back";
    // A rested tile's box is landscape: draw the portrait card rotated inside it.
    const rect = left.rested
      ? new DOMRect(
          left.rect.left + (left.rect.width - left.rect.height) / 2,
          left.rect.top + (left.rect.height - left.rect.width) / 2,
          left.rect.height,
          left.rect.width,
        )
      : left.rect;
    if (left.rested) node.style.rotate = "90deg";
    const g = this.ghost(rect, node);
    const trash = toTrash ? pile(side, "trash") : null;
    const frames: Keyframe[] = trash
      ? (() => {
          const d = delta(sourceRect(trash), rect);
          return [
            { translate: "0 0", scale: "1", opacity: 1 },
            { translate: `${d.dx}px ${d.dy}px`, scale: `${d.s}`, opacity: 0.2 },
          ];
        })()
      : [
          { scale: "1", opacity: 1 },
          { scale: "0.85", opacity: 0 },
        ];
    this.track(
      g.animate(frames, { duration: this.ms(MOTION_MS.leave), easing: EASE_IN, fill: "forwards" }),
      () => g.remove(),
    );
  }

  private donArrive(side: MotionSide, count: number, activeAfter: number) {
    const deck = pile(side, "don-deck");
    if (!deck) return;
    const src = sourceRect(deck);
    donChips(side, count, activeAfter).forEach((chip, i) => {
      const d = delta(src, chip.getBoundingClientRect());
      this.track(
        chip.animate(
          [{ translate: `${d.dx}px ${d.dy}px`, scale: `${d.s}` }, { translate: "0 0", scale: "1" }],
          { duration: this.ms(MOTION_MS.don), delay: this.ms(i * 40), easing: EASE_OUT, fill: "backwards" },
        ),
      );
    });
  }

  private powerPop(side: MotionSide, id: string, up: boolean) {
    const badge = fieldTile(side, id)?.querySelector(".power-badge:not(.counter-badge)");
    if (!badge) return;
    const glow = up ? "rgba(90, 210, 130, 0.95)" : "rgba(235, 85, 85, 0.95)";
    this.track(
      badge.animate(
        [
          { scale: "1", filter: "none" },
          { scale: "1.25", filter: `drop-shadow(0 0 6px ${glow})`, offset: 0.4 },
          { scale: "1", filter: "none" },
        ],
        { duration: this.ms(MOTION_MS.power), easing: "ease-out" },
      ),
    );
  }
}

function emptySnapshot(): Snapshot {
  return { cues: [], handRects: new Map(), leaving: new Map() };
}

function currentPlan() {
  return motionPlan(currentSettings().animationSpeed, prefersReducedMotion());
}

function canAnimate(): boolean {
  return (
    typeof document !== "undefined" &&
    !document.hidden &&
    typeof Element !== "undefined" &&
    typeof Element.prototype.animate === "function"
  );
}

// —— DOM lookups (all optional: a layout without the element just skips that motion) ——

function esc(id: string): string {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
}

function handCard(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-motion-id="${esc(id)}"]`);
}

function fieldTile(side: MotionSide, id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.side-field.side-${side} [data-instance-id="${esc(id)}"]`);
}

function pile(side: MotionSide, zone: "deck" | "life" | "trash" | "don-deck"): HTMLElement | null {
  const zoneEl = document.querySelector<HTMLElement>(`.side-field.side-${side} .zone-${zone}`);
  const el = zoneEl?.querySelector<HTMLElement>(".zone-pile") ?? zoneEl ?? null;
  return el && visible(el.getBoundingClientRect()) ? el : null;
}

function firstVisible(selectors: string[]): HTMLElement | null {
  for (const s of selectors) {
    const el = document.querySelector<HTMLElement>(s);
    if (el && visible(el.getBoundingClientRect())) return el;
  }
  return null;
}

function handZone(): HTMLElement | null {
  return firstVisible([".hand-fan-cards", ".rail-hand-cards", ".hand-dock-cards", ".hand-row"]);
}

function oppHand(): HTMLElement | null {
  return firstVisible([".opp-hand-fan-cards", ".opp-hand-backs", ".opp-hand-hint"]);
}

/** The DON!! that just arrived: active chips come first, so they end the active run. */
function donChips(side: MotionSide, count: number, activeAfter: number): HTMLElement[] {
  const chips = [
    ...document.querySelectorAll<HTMLElement>(`.side-field.side-${side} .zone-cost .don-chip`),
  ];
  const end = Math.min(activeAfter, chips.length);
  return chips.slice(Math.max(0, end - count), end);
}

/** The top card of a pile rather than the whole pile box (label and count included). */
function sourceRect(pileEl: HTMLElement): DOMRect {
  const face =
    pileEl.querySelector<HTMLElement>(".zone-pile-face.top") ??
    pileEl.querySelector<HTMLElement>(".zone-pile-face, .zone-pile-slot");
  return (face ?? pileEl).getBoundingClientRect();
}

function cardBackArt(el: Element): string {
  const face = el.querySelector(".zone-pile-face") ?? el;
  return getComputedStyle(face).getPropertyValue("--card-back-art").trim();
}

export function visible(r: { left: number; top: number; width: number; height: number }): boolean {
  if (r.width <= 0 || r.height <= 0) return false;
  const w = window.innerWidth;
  const h = window.innerHeight;
  return r.left < w && r.top < h && r.left + r.width > 0 && r.top + r.height > 0;
}

type Box = { left: number; top: number; width: number; height: number };

/** Translate + uniform scale that puts `to` over `from` (both centre-anchored). */
export function delta(from: Box, to: Box): { dx: number; dy: number; s: number } {
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const s = to.width > 0 ? from.width / to.width : 1;
  return { dx, dy, s: Math.max(0.2, Math.min(s, 3)) };
}

/** A card-sized box centred in a container (a hand zone or fan is wider than one card). */
function shrinkTo(container: DOMRect, card: Box): DOMRect {
  const w = Math.min(container.width, card.width);
  const h = Math.min(container.height, card.height);
  return new DOMRect(
    container.left + (container.width - w) / 2,
    container.top + (container.height - h) / 2,
    w,
    h,
  );
}

/** Several cards in one update leave in quick succession, never more than ~240ms in total. */
export function staggerMs(count: number): number {
  return count <= 1 ? 0 : Math.min(60, Math.floor(240 / (count - 1)));
}

/**
 * One keyframe of a flight from `d` (offset 0) to home (offset 1): the path and
 * size interpolate linearly, and `widthScale` squeezes the card horizontally
 * (0 = edge-on) for the flip.
 */
function flightFrame(d: { dx: number; dy: number; s: number }, t: number, widthScale: number): Keyframe {
  const k = 1 - t;
  const s = d.s + (1 - d.s) * t;
  return { translate: `${d.dx * k}px ${d.dy * k}px`, scale: `${s * widthScale} ${s}`, offset: t };
}
