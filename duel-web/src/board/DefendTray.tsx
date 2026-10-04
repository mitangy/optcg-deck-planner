import { useEffect, useState, type ReactNode } from "react";
import { isTcgplayerCdnUrl, localCardArtPath } from "../cards/cardImage";
import { resolveCardImageUrl } from "../decks/artPrefs";
import type { Seat } from "../net/protocol";
import type { DefendModel } from "./defendModel";
import { usePointerDrag } from "./usePointerDrag";

function Thumb({ defId, ownerSeat }: { defId: string; ownerSeat: Seat }) {
  const [failed, setFailed] = useState(false);
  const [local, setLocal] = useState(false);
  useEffect(() => {
    setFailed(false);
    setLocal(false);
  }, [defId]);
  const primary = resolveCardImageUrl(defId, { ownerSeat, size: "thumb" });
  const src = local ? localCardArtPath(defId) : primary;
  return (
    <span className="defend-chip-thumb" aria-hidden>
      {src && !failed ? (
        <img
          src={src}
          alt=""
          draggable={false}
          // Same fallback as CardTile: CDN art first, then the local mirror.
          onError={() => (!local && isTcgplayerCdnUrl(primary) ? setLocal(true) : setFailed(true))}
        />
      ) : (
        <span className="defend-chip-fallback">{defId}</span>
      )}
    </span>
  );
}

/** Drag a Counter chip onto the defending card: plays it at once. */
export type CounterDragHandlers = {
  onStart: (cardId: string) => void;
  onEnd: (cardId: string, clientX: number, clientY: number) => void;
  onCancel: () => void;
};

/** A counter chip that is also a drag source (tap still stages / plays). */
function CounterChipButton({
  cardId,
  className,
  label,
  pressed,
  onClick,
  drag,
  children,
}: {
  cardId: string;
  className: string;
  label: string;
  pressed?: boolean;
  onClick: () => void;
  drag?: CounterDragHandlers;
  children: ReactNode;
}) {
  const { bind, dragging } = usePointerDrag({
    enabled: drag != null,
    payload: cardId,
    onDragStart: () => drag?.onStart(cardId),
    onDragEnd: (_id, x, y) => drag?.onEnd(cardId, x, y),
    onDragCancel: () => drag?.onCancel(),
  });
  return (
    <button
      type="button"
      className={`${className}${drag ? " chip-draggable" : ""}${dragging ? " chip-dragging" : ""}`}
      aria-pressed={pressed}
      aria-label={label}
      onClick={onClick}
      draggable={false}
      data-hand-card-id={cardId}
      {...bind}
    >
      {children}
    </button>
  );
}

function power(n: number | null): string {
  return n == null ? "?" : String(n);
}

type Props = {
  model: DefendModel;
  ownerSeat: Seat;
  /** Remaining response clock, 0-1, or null when the room has none. */
  clock: number | null;
  onToggleBlocker: (id: string) => void;
  onToggleCounter: (id: string) => void;
  onCounterEvent: (index: number) => void;
  /** Drag-to-counter from the chips (counter step only). */
  counterDrag?: CounterDragHandlers;
};

/**
 * Answering an attack in one place: the battle and what it takes to survive,
 * then the Blockers (block step) or Counter cards (counter step) as big
 * tappable chips. Staging is local; the primary button in the intent bar
 * sends it. Fixed height in portrait, so staging never moves the board.
 */
export function DefendTray({
  model,
  ownerSeat,
  clock,
  onToggleBlocker,
  onToggleCounter,
  onCounterEvent,
  counterDrag,
}: Props) {
  const m = model;
  const stagedSet = new Set(m.stagedIds);
  const safe = m.remaining === 0;

  let verdict: string;
  if (m.gap == null || m.remaining == null) verdict = "Attack incoming";
  else if (m.phase === "counter" && m.stagedIds.length > 0) {
    const total = `+${m.stagedTotal}${m.stagedUnknown ? "+" : ""} staged`;
    verdict = m.stagedUnknown
      ? total
      : safe
        ? `${total} · Safe`
        : `${total} · still short by ${m.remaining}`;
  } else if (m.gap === 0) verdict = "Safe";
  else verdict = `Need +${m.gap} to survive`;

  return (
    <section
      className={`defend-tray defend-${m.phase}`}
      aria-label={m.phase === "block" ? "Block or take the attack" : "Counter or take the hit"}
    >
      {clock != null ? (
        <div className={`defend-clock${clock < 0.25 ? " low" : ""}`} role="presentation">
          <span style={{ transform: `scaleX(${clock})` }} />
        </div>
      ) : null}
      <p className="defend-line">
        <span className="defend-line-text">
          <strong>{m.attackerName}</strong> {power(m.attackerPower)} →{" "}
          {m.blocking ? "Blocker " : ""}
          <strong>{m.defenderName}</strong> {power(m.defenderPower)}
          {m.preview ? " (if it blocks)" : ""}
        </span>
      </p>
      <p
        className={`defend-verdict${m.gap === 0 || (m.stagedIds.length > 0 && safe) ? " is-safe" : ""}`}
        role="status"
      >
        {verdict}
      </p>
      <div className="defend-chips">
        {m.phase === "block" ? (
          m.blockers.length === 0 ? (
            <p className="defend-none">No Blocker available</p>
          ) : (
            m.blockers.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`defend-chip${m.stagedBlockerId === b.id ? " staged" : ""}`}
                aria-pressed={m.stagedBlockerId === b.id}
                aria-label={`Block with ${b.name}, power ${power(b.power)}`}
                onClick={() => onToggleBlocker(b.id)}
              >
                <Thumb defId={b.defId} ownerSeat={ownerSeat} />
                <span className="defend-chip-text">
                  <span className="defend-chip-main">{power(b.power)}</span>
                  <span className="defend-chip-sub">{b.name}</span>
                </span>
              </button>
            ))
          )
        ) : (
          <>
            {m.counters.map((c) => (
              <CounterChipButton
                key={c.id}
                cardId={c.id}
                className={`defend-chip${stagedSet.has(c.id) ? " staged" : ""}`}
                pressed={stagedSet.has(c.id)}
                label={`Counter with ${c.name}${c.value != null ? `, plus ${c.value}` : ""}`}
                onClick={() => onToggleCounter(c.id)}
                drag={counterDrag}
              >
                <Thumb defId={c.defId} ownerSeat={ownerSeat} />
                <span className="defend-chip-text">
                  <span className="defend-chip-main">{c.value != null ? `+${c.value}` : "+?"}</span>
                  <span className="defend-chip-sub">{c.name}</span>
                </span>
              </CounterChipButton>
            ))}
            {m.events.map((e, i) => (
              <CounterChipButton
                key={e.id}
                cardId={e.id}
                className="defend-chip defend-chip-event"
                label={`Event ${e.name}, cost ${e.cost} DON, counter ${e.valueLabel}`}
                onClick={() => onCounterEvent(i)}
                drag={counterDrag}
              >
                <Thumb defId={e.defId} ownerSeat={ownerSeat} />
                <span className="defend-chip-text">
                  <span className="defend-chip-main">{e.valueLabel}</span>
                  <span className="defend-chip-sub">
                    Event · {e.cost} DON!!
                  </span>
                  <span className="defend-chip-sub">{e.name}</span>
                </span>
              </CounterChipButton>
            ))}
            {m.counters.length + m.events.length === 0 ? (
              <p className="defend-none">No Counter cards to play</p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
