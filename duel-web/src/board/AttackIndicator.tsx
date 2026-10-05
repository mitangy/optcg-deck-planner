import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { PlayerView } from "../net/protocol";
import { useDuelSettings } from "../settings";
import { arcGeometry, battleEndpoints, boxCenter, type Box, type Pt } from "./battleArc";
import { findDropTargetAtPoint } from "./dragIntents";
import { dragArrow } from "./dragArrow";
import { findInstanceBox, useTrackedBoxes } from "./useTrackedBoxes";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
  );
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

/**
 * "Cannon shot" battle overlay: a glowing powder-trail arc lobs from the
 * attacker to its target, a cannonball rides the arc on a loop, and a
 * spinning gunsight reticle marks the card being hit (red when it's yours,
 * gold when you're the one attacking). A faint dashed line shows the original
 * target when a Blocker redirected the attack.
 *
 * Fixed-position SVG over the viewport — never participates in layout. It is
 * drawn inside the board (not portaled to <body>) so it shares the board's
 * stacking context: prompts (z-index 45+) paint above it, cards and the dock
 * below. `dimmed` fades it while one of your prompts is open.
 */
export function AttackIndicator({ view, dimmed = false }: { view: PlayerView | null; dimmed?: boolean }) {
  const ends = battleEndpoints(view);
  const systemReduced = usePrefersReducedMotion();
  const reduced = useDuelSettings().reduceMotion || systemReduced;
  const ids = ends
    ? [ends.attackerId, ends.targetId, ...(ends.redirectedFromId ? [ends.redirectedFromId] : [])]
    : null;
  const boxes = useTrackedBoxes(ids);

  if (!ends || !boxes || typeof document === "undefined") return null;
  const [atkBox, tgtBox, origBox] = boxes;
  if (!atkBox || !tgtBox) return null;

  const arc = arcGeometry(atkBox, tgtBox);
  const tc = boxCenter(tgtBox);
  const reticleR = reticleRadius(tgtBox);
  const tone = ends.incoming ? "incoming" : "outgoing";
  const flightSec = Math.min(1.6, Math.max(0.8, arc.length / 420));
  const flightDur = `${flightSec.toFixed(2)}s`;
  const shotKey = `${ends.attackerId}->${ends.targetId}`;

  const overlay = (
    <svg
      className={`attack-overlay attack-${tone}${reduced ? " reduced" : ""}${dimmed ? " attack-dim" : ""}`}
      aria-hidden
      focusable="false"
    >
      <AttackDefs />

      {origBox ? (
        <line
          className="atk-redirect"
          x1={boxCenter(origBox).x}
          y1={boxCenter(origBox).y}
          x2={tc.x}
          y2={tc.y}
        />
      ) : null}

      {/* Attacker: lantern glow around the striking card. */}
      <rect
        className="atk-source"
        x={atkBox.left - 4}
        y={atkBox.top - 4}
        width={atkBox.width + 8}
        height={atkBox.height + 8}
        rx={10}
      />

      <g key={shotKey}>
        <path className="atk-trail-glow" d={arc.d} filter="url(#atk-glow)" />
        <path className="atk-trail" d={arc.d} markerEnd="url(#atk-head)" />
        <path className="atk-fuse" d={arc.d} />

        {!reduced ? (
          <g className="atk-ball">
            {[0.18, 0.12, 0.06].map((lag, i) => (
              <circle key={i} r={5 - i * 1.2 + 2} className={`atk-smoke atk-smoke-${i}`}>
                <animateMotion
                  dur={flightDur}
                  repeatCount="indefinite"
                  path={arc.d}
                  // Same phase as `lag` seconds behind the ball, but negative so
                  // the puff is already on the path at t=0 (never parked at 0,0).
                  begin={`${(lag - flightSec).toFixed(2)}s`}
                  keyPoints="0;1"
                  keyTimes="0;1"
                  calcMode="spline"
                  keySplines="0.45 0 0.55 1"
                />
              </circle>
            ))}
            <circle r={7} fill="url(#atk-ball)" className="atk-shot">
              <animateMotion
                dur={flightDur}
                repeatCount="indefinite"
                path={arc.d}
                keyPoints="0;1"
                keyTimes="0;1"
                calcMode="spline"
                keySplines="0.45 0 0.55 1"
              />
            </circle>
          </g>
        ) : null}

        {/* Impact splash, synced to each landing. */}
        {!reduced ? (
          <circle cx={arc.to.x} cy={arc.to.y} r={reticleR * 0.5} className="atk-impact">
            <animate
              attributeName="r"
              values={`2;${reticleR * 0.95};${reticleR * 0.95}`}
              keyTimes="0;0.35;1"
              dur={flightDur}
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.9;0;0"
              keyTimes="0;0.35;1"
              dur={flightDur}
              repeatCount="indefinite"
            />
          </circle>
        ) : null}
      </g>

      {/* Gunsight reticle on the target card. */}
      <Reticle box={tgtBox} />

    </svg>
  );

  return overlay;
}

function reticleRadius(box: Box): number {
  return Math.max(16, Math.min(box.width, box.height) * 0.36);
}

/** Glow filter, cannonball shading and arrowhead shared by the battle overlays. */
function AttackDefs() {
  return (
    <defs>
      <filter id="atk-glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="4" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <radialGradient id="atk-ball" cx="35%" cy="35%" r="65%">
        <stop offset="0%" stopColor="#9aa3a8" />
        <stop offset="45%" stopColor="#3a4247" />
        <stop offset="100%" stopColor="#0c0f11" />
      </radialGradient>
      <marker
        id="atk-head"
        viewBox="0 0 12 12"
        refX="7"
        refY="6"
        markerWidth="5"
        markerHeight="5"
        orient="auto-start-reverse"
      >
        <path d="M1 1 L11 6 L1 11 L4 6 Z" className="atk-head" />
      </marker>
    </defs>
  );
}

/** Spinning gunsight on a target card. */
function Reticle({ box }: { box: Box }) {
  const c = boxCenter(box);
  const r = reticleRadius(box);
  return (
    <g className="atk-reticle" transform={`translate(${c.x} ${c.y})`}>
      <circle className="atk-reticle-ring" r={r} />
      <g className="atk-reticle-spin">
        <circle className="atk-reticle-dash" r={r + 6} />
        {[0, 90, 180, 270].map((deg) => (
          <line
            key={deg}
            className="atk-reticle-tick"
            x1={0}
            y1={-(r - 6)}
            x2={0}
            y2={-(r + 12)}
            transform={`rotate(${deg})`}
          />
        ))}
      </g>
      <circle className="atk-reticle-core" r={3} />
    </g>
  );
}

/**
 * Aim arrow while you drag an attacker: the powder trail is drawn from the
 * attacker to the pointer as soon as the drag starts, and snaps onto a legal
 * target (with its reticle) when the pointer is over one. No cannonball until
 * the attack is declared. Fixed-position SVG portal; never participates in layout.
 */
export function DragAttackArrow({ attackerId }: { attackerId: string | null }) {
  const boxes = useTrackedBoxes(attackerId ? [attackerId] : null);
  const [pointer, setPointer] = useState<Pt | null>(null);
  const active = attackerId != null;

  useEffect(() => {
    if (!active) {
      setPointer(null);
      return;
    }
    const onMove = (e: PointerEvent) => setPointer({ x: e.clientX, y: e.clientY });
    window.addEventListener("pointermove", onMove, { capture: true, passive: true });
    return () => window.removeEventListener("pointermove", onMove, { capture: true });
  }, [active]);

  const atkBox = boxes?.[0] ?? null;
  if (!active || !atkBox || !pointer || typeof document === "undefined") return null;
  const aim = dragArrow(atkBox, pointer, findDropTargetAtPoint(pointer.x, pointer.y), findInstanceBox);
  if (!aim) return null;

  return createPortal(
    <svg
      className={`attack-overlay attack-outgoing attack-aim${aim.targetBox ? " attack-aim-locked" : ""}`}
      aria-hidden
      focusable="false"
    >
      <AttackDefs />
      <rect
        className="atk-source"
        x={atkBox.left - 4}
        y={atkBox.top - 4}
        width={atkBox.width + 8}
        height={atkBox.height + 8}
        rx={10}
      />
      <path className="atk-trail-glow" d={aim.arc.d} filter="url(#atk-glow)" />
      <path className="atk-trail" d={aim.arc.d} markerEnd="url(#atk-head)" />
      {aim.targetBox ? <path className="atk-fuse" d={aim.arc.d} /> : null}
      {aim.targetBox ? <Reticle box={aim.targetBox} /> : null}
    </svg>,
    document.body,
  );
}
