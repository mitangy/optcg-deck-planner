/**
 * Card spotlight layer: the card that was just played or trashed, big over
 * its owner's half of the board, then shrinking into the spot it went to (its
 * field tile, or the trash). Planning lives in cardSpotlight.ts.
 *
 * Never gates input: the layer ignores the pointer, the board is already
 * updated underneath, and any pointer or key press ends the batch on screen.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { lookupCard } from "../cards/atlas";
import { resolveCardImageUrl } from "../decks/artPrefs";
import { currentSettings } from "../settings";
import type { BattleLogEntry } from "./battleLog";
import { prefersReducedMotion } from "./BoardMotion";
import {
  newSpotlightBatch,
  spotlightTiming,
  type SpotlightBatch,
  type SpotlightCard,
  type SpotlightTiming,
} from "./cardSpotlight";
import { motionPlan } from "./motionSpeed";

/** Batches waiting beyond this are dropped (oldest first): the board moved on. */
const MAX_QUEUED = 3;

/**
 * Queue of spotlight batches, one per log update that played or trashed a
 * card (never on mount, resync or undo). `enabled` = the setting is on and the
 * match is live; the log is tracked either way so turning it on never replays.
 */
export function useCardSpotlights(battleLog: readonly BattleLogEntry[], enabled: boolean) {
  const [queue, setQueue] = useState<SpotlightBatch[]>([]);
  const prevLast = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const prev = prevLast.current;
    prevLast.current = battleLog.length ? battleLog[battleLog.length - 1]!.id : null;
    if (!enabled || (typeof document !== "undefined" && document.hidden)) return;
    const batch = newSpotlightBatch(prev, battleLog);
    if (batch) setQueue((q) => [...q, batch].slice(-MAX_QUEUED));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleLog]);
  useEffect(() => {
    if (!enabled) setQueue([]);
  }, [enabled]);
  const done = useCallback(() => setQueue((q) => q.slice(1)), []);
  return { current: queue[0] ?? null, waiting: Math.max(0, queue.length - 1), done };
}

export function CardSpotlightLayer({
  batch,
  waiting,
  oppSeat,
  onDone,
}: {
  batch: SpotlightBatch | null;
  waiting: number;
  oppSeat: 0 | 1;
  onDone: () => void;
}) {
  const layer = useRef<HTMLDivElement>(null);
  // Speed and queue length are read once, when the batch comes up.
  const timing = useMemo<SpotlightTiming | null>(
    () =>
      batch && canAnimate()
        ? spotlightTiming(motionPlan(currentSettings().animationSpeed, prefersReducedMotion()), waiting)
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [batch],
  );
  // Animations Off: the batch is dropped unseen.
  useEffect(() => {
    if (batch && !timing) onDone();
  }, [batch, timing, onDone]);

  useLayoutEffect(() => {
    const root = layer.current;
    if (!batch || !timing || !root) return;
    const running: Animation[] = [];
    for (const g of root.querySelectorAll<HTMLElement>(".card-spotlight-group")) placeGroup(g);
    const total = timing.enter + timing.hold + timing.exit;
    const shown = timing.enter / total;
    const leaving = (timing.enter + timing.hold) / total;
    for (const el of root.querySelectorAll<HTMLElement>(".card-spotlight-card")) {
      const card = batch.groups.flatMap((g) => g.cards).find((c) => c.entryId === el.dataset.entryId);
      const from = el.getBoundingClientRect();
      const to = timing.travel && card ? landingRect(card, oppSeat) : null;
      const exit: Keyframe = to
        ? {
            translate: `${to.left + to.width / 2 - (from.left + from.width / 2)}px ${to.top + to.height / 2 - (from.top + from.height / 2)}px`,
            scale: `${Math.max(0.1, to.width / Math.max(1, from.width))}`,
            opacity: 0.2,
          }
        : { translate: "0 0", scale: timing.travel ? "0.9" : "1", opacity: 0 };
      running.push(
        el.animate(
          [
            { translate: "0 0", scale: timing.travel ? "0.72" : "1", opacity: 0, offset: 0 },
            { translate: "0 0", scale: "1", opacity: 1, offset: shown },
            { translate: "0 0", scale: "1", opacity: 1, offset: leaving },
            { ...exit, offset: 1 },
          ],
          { duration: total, easing: "ease-out", fill: "both" },
        ),
      );
    }
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      onDone();
    };
    const skip = () => running.forEach((a) => a.finish());
    if (running.length === 0) end();
    else void Promise.all(running.map((a) => a.finished)).then(end, end);
    window.addEventListener("pointerdown", skip, true);
    window.addEventListener("keydown", skip, true);
    return () => {
      window.removeEventListener("pointerdown", skip, true);
      window.removeEventListener("keydown", skip, true);
      ended = true;
      running.forEach((a) => a.cancel());
    };
  }, [batch, timing, oppSeat, onDone]);

  if (!batch || !timing) return null;
  return createPortal(
    <div ref={layer} className="card-spotlight-layer" aria-hidden="true" key={batch.id}>
      {batch.groups.map((g) => (
        <div
          key={g.ownerSeat}
          className="card-spotlight-group"
          data-side={g.ownerSeat === oppSeat ? "opp" : "you"}
          style={{ "--spot-n": g.cards.length } as CSSProperties}
        >
          {g.cards.map((c) => (
            <SpotlightCardView key={c.entryId} card={c} />
          ))}
          {g.more > 0 ? <span className="card-spotlight-more">+{g.more} more</span> : null}
        </div>
      ))}
    </div>,
    document.body,
  );
}

function SpotlightCardView({ card }: { card: SpotlightCard }) {
  const entry = lookupCard(card.defId);
  const src = resolveCardImageUrl(card.defId, { ownerSeat: card.ownerSeat, size: "large" });
  const [failed, setFailed] = useState(false);
  return (
    <div className="card-spotlight-card" data-entry-id={card.entryId} data-def-id={card.defId}>
      <div className="card-spotlight-art">
        {/* Shown until the art loads, and instead of art that fails. */}
        <span className="card-spotlight-name">{entry.name || card.defId}</span>
        {src && !failed ? (
          <img src={src} alt={entry.name} draggable={false} onError={() => setFailed(true)} />
        ) : null}
      </div>
      <span className="card-spotlight-label">{card.label}</span>
    </div>
  );
}

function canAnimate(): boolean {
  return typeof Element !== "undefined" && typeof Element.prototype.animate === "function";
}

// —— DOM lookups (all optional: a layout without the element fades in place) ——

function esc(id: string): string {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
}

function visibleRect(el: Element | null): DOMRect | null {
  const r = el?.getBoundingClientRect();
  return r && r.width > 0 && r.height > 0 ? r : null;
}

function sideOf(seat: 0 | 1, oppSeat: 0 | 1): "you" | "opp" {
  return seat === oppSeat ? "opp" : "you";
}

/** Centre the group over its owner's half of the board, kept inside the window. */
function placeGroup(g: HTMLElement) {
  const half = visibleRect(document.querySelector(`.side-field.side-${g.dataset.side}`));
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const box = g.getBoundingClientRect();
  const cx = half ? half.left + half.width / 2 : vw / 2;
  const cy = half ? half.top + half.height / 2 : vh / 2;
  const left = Math.min(Math.max(8, cx - box.width / 2), Math.max(8, vw - box.width - 8));
  const top = Math.min(Math.max(8, cy - box.height / 2), Math.max(8, vh - box.height - 8));
  g.style.left = `${Math.round(left)}px`;
  g.style.top = `${Math.round(top)}px`;
}

/**
 * Where the card went: its field tile for a Character or Stage that stayed in
 * play, otherwise its owner's trash (an Event resolves into the trash too).
 */
function landingRect(card: SpotlightCard, oppSeat: 0 | 1): DOMRect | null {
  const side = sideOf(card.ownerSeat, oppSeat);
  if (card.kind === "play" && card.instanceId) {
    const tile = visibleRect(
      document.querySelector(`.side-field.side-${side} [data-instance-id="${esc(card.instanceId)}"]`),
    );
    if (tile) return tile;
    if (lookupCard(card.defId).type !== "event") return null;
  }
  const trash = document.querySelector(`.side-field.side-${side} .zone-trash`);
  return visibleRect(trash?.querySelector(".zone-pile-face.top, .zone-pile-face, .zone-pile") ?? trash ?? null);
}
