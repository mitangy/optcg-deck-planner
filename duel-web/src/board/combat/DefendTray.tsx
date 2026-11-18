import { useEffect, useState, type ReactNode } from "react";
import { artAfterError, isLocalCardsUrl, isPlaceholderArt, isTcgplayerCdnUrl } from "@optcg/ui/cardArt";
import { resolveCardImageUrl } from "../../decks/artPrefs";
import type { Seat } from "../../net/protocol";
import { defendVerdict, type DefendModel } from "./defendModel";
import { usePointerDrag } from "../input/usePointerDrag";

function Thumb({ defId, artCopy, ownerSeat }: { defId: string; artCopy?: number; ownerSeat: Seat }) {
  const [failed, setFailed] = useState(false);
  const [local, setLocal] = useState(false);
  useEffect(() => {
    setFailed(false);
    setLocal(false);
  }, [defId]);
  const primary = resolveCardImageUrl(defId, { ownerSeat, artCopy, size: "thumb" });
  const src = local ? (primary ? artAfterError(primary, defId) : null) : primary;
  return (
    <span className="defend-chip-thumb" aria-hidden>
      {src && !failed ? (
        <img
          src={src}
          alt=""
          draggable={false}
          onError={() => (!local && (isTcgplayerCdnUrl(primary) || isLocalCardsUrl(primary)) ? setLocal(true) : setFailed(true))}
          onLoad={(e) => {
            if (isPlaceholderArt(src, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)) {
              if (!local) setLocal(true);
              else setFailed(true);
            }
          }}
        />
      ) : (
        <span className="defend-chip-fallback">{defId}</span>
      )}
    </span>
  );
}

export type CounterDragHandlers = {
  onStart: (cardId: string) => void;
  onEnd: (cardId: string, clientX: number, clientY: number) => void;
  onCancel: () => void;
};

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
  layout?: "tray" | "rail";
  ownerSeat: Seat;
  clock: number | null;
  onToggleBlocker: (id: string) => void;
  onToggleCounter: (id: string) => void;
  onCounterEvent: (index: number) => void;
  onSkipBlockCounter?: (id: string) => void;
  counterDrag?: CounterDragHandlers;
  handCount?: number;
  // False when the attack summary and verdict are shown above the Pass button instead.
  summary?: boolean;
};

export function DefendTray({
  model,
  layout = "tray",
  ownerSeat,
  clock,
  onToggleBlocker,
  onToggleCounter,
  onCounterEvent,
  onSkipBlockCounter,
  counterDrag,
  handCount,
  summary = true,
}: Props) {
  const m = model;
  const stagedSet = new Set(m.stagedIds);
  const verdict = defendVerdict(m);

  const staged = m.phase === "counter" ? m.stagedIds.length : 0;
  const handAfter = handCount != null ? Math.max(handCount - staged, 0) : 0;

  return (
    <section
      className={`defend-tray defend-${m.phase}${layout === "rail" ? " defend-rail" : ""}`}
      aria-label={m.phase === "block" ? "Block or take the attack" : "Counter or take the hit"}
    >
      {clock != null ? (
        <div className={`defend-clock${clock < 0.25 ? " low" : ""}`} role="presentation">
          <span style={{ transform: `scaleX(${clock})` }} />
        </div>
      ) : null}
      {summary ? (
        <>
      <p className="defend-line">
        <span className="defend-line-text">
          <strong>{m.attackerName}</strong> ({power(m.attackerPower)}) attacks{" "}
          {m.blocking ? "Blocker " : ""}
          <strong>{m.defenderName}</strong> ({power(m.defenderPower)})
          {m.preview ? " if it blocks" : ""}
        </span>
      </p>
      <div className="defend-verdict-row">
        <p
          className={`defend-verdict${verdict.safe ? " is-safe" : ""}`}
          role="status"
        >
          {verdict.text}
        </p>
        {handCount != null ? (
          <span
            className="defend-hand"
            aria-label={`Your hand: ${handCount} ${handCount === 1 ? "card" : "cards"}${
              staged > 0 ? `, ${handAfter} after these counters` : ""
            }`}
          >
            Hand {handCount}
            {staged > 0 ? ` → ${handAfter}` : ""}
          </span>
        ) : null}
      </div>
        </>
      ) : null}
      <div className="defend-chips">
        {m.phase === "block" ? (
          m.blockers.length === 0 && m.earlyCounters.length === 0 ? (
            <p className="defend-none">No Blocker available</p>
          ) : (
            <>
              {m.blockers.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={`defend-chip${m.stagedBlockerId === b.id ? " staged" : ""}`}
                  aria-pressed={m.stagedBlockerId === b.id}
                  aria-label={`Block with ${b.name}, power ${power(b.power)}`}
                  onClick={() => onToggleBlocker(b.id)}
                >
                  <Thumb defId={b.defId} artCopy={b.artCopy} ownerSeat={ownerSeat} />
                  <span className="defend-chip-text">
                    <span className="defend-chip-main">{power(b.power)}</span>
                    <span className="defend-chip-sub">{b.name}</span>
                  </span>
                </button>
              ))}
              {m.earlyCounters.length > 0 ? (
                <span className="defend-chips-sep" aria-hidden>
                  {m.blockers.length > 0 ? "or" : "No Blocker"}
                </span>
              ) : null}
              {m.earlyCounters.map((c) => (
                <CounterChipButton
                  key={c.id}
                  cardId={c.id}
                  className="defend-chip defend-chip-early"
                  label={`No block, counter with ${c.name}, ${c.label}`}
                  onClick={() => onSkipBlockCounter?.(c.id)}
                  drag={counterDrag}
                >
                  <Thumb defId={c.defId} artCopy={c.artCopy} ownerSeat={ownerSeat} />
                  <span className="defend-chip-text">
                    <span className="defend-chip-main">{c.label}</span>
                    <span className="defend-chip-sub">{c.name}</span>
                  </span>
                </CounterChipButton>
              ))}
            </>
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
                <Thumb defId={c.defId} artCopy={c.artCopy} ownerSeat={ownerSeat} />
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
                <Thumb defId={e.defId} artCopy={e.artCopy} ownerSeat={ownerSeat} />
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
