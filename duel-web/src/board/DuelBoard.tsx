import { useMemo, useState } from "react";
import type { Intent, MatchOverMessage, PlayerView, Seat } from "../net/protocol";
import { CardTile } from "./CardTile";
import {
  canDragDon,
  canDragHandCard,
  canDropPlayOnField,
  findDropTargetAtPoint,
  giveDonTargetIds,
  playCardTrashTargetIds,
  resolveDropIntent,
  type DragPayload,
} from "./dragIntents";
import { IntentBar } from "./IntentBar";
import { SideField } from "./SideField";

type Props = {
  view: PlayerView | null;
  seat: Seat | null;
  matchId: string | null;
  errorBanner: string | null;
  matchOver: MatchOverMessage["result"] | null;
  spectator?: boolean;
  onSendIntent: (intent: Intent) => void;
  onLeave: () => void;
  onClearError: () => void;
};

const EMPTY_IDS = new Set<string>();

export function DuelBoard({
  view,
  seat,
  matchId,
  errorBanner,
  matchOver,
  spectator = false,
  onSendIntent,
  onLeave,
  onClearError,
}: Props) {
  const [handFilter, setHandFilter] = useState<number | null>(null);
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null);

  const over = matchOver != null || view?.winner != null;
  const mySeat = seat ?? view?.seat ?? null;
  const spectating = spectator || Boolean(view?.spectator);
  const yourTurn =
    Boolean(view) && !spectating && view!.activeSeat === mySeat && !over;
  const intents = view?.legalIntents ?? [];
  const dndEnabled = yourTurn && !spectating && !over;
  const costArea = view?.you.costArea ?? [];

  const draggableDonIds = useMemo(() => {
    if (!dndEnabled) return EMPTY_IDS;
    const ids = new Set<string>();
    for (const t of costArea) {
      if (canDragDon(intents, t.id)) ids.add(t.id);
    }
    return ids;
  }, [dndEnabled, intents, costArea]);

  const giveDonHighlightIds = useMemo(() => {
    if (dragPayload?.type !== "give_don") return EMPTY_IDS;
    return new Set(giveDonTargetIds(intents, dragPayload.donId));
  }, [dragPayload, intents]);

  const playFieldHighlight = Boolean(
    dragPayload?.type === "play_card" &&
      canDropPlayOnField(intents, dragPayload.handIndex),
  );

  const playTrashHighlightIds = useMemo(() => {
    if (dragPayload?.type !== "play_card") return EMPTY_IDS;
    return new Set(playCardTrashTargetIds(intents, dragPayload.handIndex));
  }, [dragPayload, intents]);

  function commitDrop(payload: DragPayload, clientX: number, clientY: number) {
    const drop = findDropTargetAtPoint(clientX, clientY);
    const intent = resolveDropIntent(payload, drop, intents);
    setDragPayload(null);
    if (intent) {
      setHandFilter(null);
      onSendIntent(intent);
    }
  }

  if (!view) {
    return (
      <div className="board-root arena">
        <header className="hud-bar">
          <div className="hud-brand">OPTCG DUEL</div>
          <div className="hud-status">Waiting for opponent…</div>
          <div className="hud-actions">
            <span className="match-id" title={matchId ?? undefined}>
              Room {matchId ?? "—"}
            </span>
            <button type="button" className="leave-btn" onClick={onLeave}>
              Leave
            </button>
          </div>
        </header>
        {errorBanner ? (
          <button type="button" className="error-banner" onClick={onClearError}>
            {errorBanner}
          </button>
        ) : null}
        <div className="loading arena-loading">
          Share the room id — match starts when both seats join.
        </div>
      </div>
    );
  }

  const you = view.you;
  const opp = view.opponent;

  return (
    <div
      className={`board-root arena${yourTurn ? " your-turn" : ""}${
        dragPayload ? " is-dnd" : ""
      }`}
    >
      <header className="hud-bar">
        <div className="hud-brand">OPTCG DUEL</div>
        <div className={`hud-status${yourTurn ? " pulse" : ""}`}>
          <span className="hud-phase">{view.phase}</span>
          <span className="hud-sep">·</span>
          <span>Turn {view.turnNumber}</span>
          <span className="hud-sep">·</span>
          <span>{spectating ? "Spectating" : `Seat ${mySeat}`}</span>
          {yourTurn ? <span className="hud-turn-chip">YOUR TURN</span> : null}
          {spectating ? <span className="hud-turn-chip">SPECTATOR</span> : null}
        </div>
        <div className="hud-actions">
          <span className="match-id" title={matchId ?? undefined}>
            Room {matchId ?? "—"}
          </span>
          <button type="button" className="leave-btn" onClick={onLeave}>
            Leave
          </button>
        </div>
      </header>

      {errorBanner ? (
        <button type="button" className="error-banner" onClick={onClearError}>
          {errorBanner}
        </button>
      ) : null}

      <div className="playmat">
        <div className="playmat-inner">
          <div className="opp-hand-hint" aria-label={`Opponent hand ${opp.handCount}`}>
            <span className="opp-hand-label">Opp hand</span>
            <div className="opp-hand-backs">
              {Array.from({ length: Math.min(opp.handCount, 8) }).map((_, i) => (
                <span key={i} className="card-back" />
              ))}
              {opp.handCount > 8 ? <span className="opp-hand-more">+{opp.handCount - 8}</span> : null}
            </div>
          </div>

          <SideField
            side="opp"
            compact
            data={{
              leader: opp.leader,
              characters: opp.characters,
              stage: opp.stage,
              deckCount: opp.deckCount,
              trash: opp.trash,
              lifeCount: opp.lifeCount,
              donDeckCount: opp.donDeckCount,
              costAreaCount: opp.costAreaCount,
              activeDonCount: opp.activeDonCount,
            }}
          />

          <div className="midline">
            {Boolean(view.battle || view.pendingTrigger) ? (
              <div className="prompt">
                {view.pendingTrigger
                  ? `Trigger pending: ${JSON.stringify(view.pendingTrigger)}`
                  : `Battle: ${JSON.stringify(view.battle)}`}
              </div>
            ) : (
              <div className="midline-ornament" aria-hidden>
                <span />
              </div>
            )}
          </div>

          <SideField
            side="you"
            data={{
              leader: you.leader,
              characters: you.characters,
              stage: you.stage,
              deckCount: you.deckCount,
              trash: you.trash,
              lifeCount: you.lifeCount,
              donDeckCount: you.donDeckCount,
              costArea: you.costArea,
              activeDonCount: you.activeDonCount,
            }}
            drag={
              dndEnabled
                ? {
                    draggableDonIds,
                    draggingDonId:
                      dragPayload?.type === "give_don" ? dragPayload.donId : null,
                    onDonDragStart: (donId) =>
                      setDragPayload({ type: "give_don", donId }),
                    onDonDragEnd: (donId, x, y) =>
                      commitDrop({ type: "give_don", donId }, x, y),
                    onDonDragCancel: () => setDragPayload(null),
                    giveDonHighlightIds,
                    playTrashHighlightIds,
                    playFieldHighlight,
                  }
                : undefined
            }
          />
        </div>
      </div>

      <div className="hand-rail">
        <div className="hand-rail-head">
          <span className="hand-rail-title">{spectating ? "Seat hand (hidden)" : "Hand"}</span>
          <span className="hand-rail-count">
            {spectating ? (you.handCount ?? 0) : you.hand.length}
          </span>
        </div>
        <div className="hand-row">
          {spectating
            ? Array.from({ length: Math.min(you.handCount ?? 0, 8) }).map((_, i) => (
                <span key={i} className="card-back hand-back" />
              ))
            : you.hand.map((c, idx) => {
                const playable = dndEnabled && canDragHandCard(intents, idx);
                return (
                  <CardTile
                    key={c.id}
                    defId={c.defId}
                    selected={handFilter === idx}
                    onClick={() => setHandFilter((prev) => (prev === idx ? null : idx))}
                    dragEnabled={playable}
                    dragPayload={{ type: "play_card", handIndex: idx }}
                    onDragStart={() =>
                      setDragPayload({ type: "play_card", handIndex: idx })
                    }
                    onDragEnd={(x, y) =>
                      commitDrop({ type: "play_card", handIndex: idx }, x, y)
                    }
                    onDragCancel={() => setDragPayload(null)}
                  />
                );
              })}
        </div>
      </div>

      {!spectating ? (
        <IntentBar
          intents={view.legalIntents}
          view={view}
          disabled={over}
          filterHandIndex={handFilter}
          onSend={(intent) => {
            setHandFilter(null);
            onSendIntent(intent);
          }}
        />
      ) : (
        <div className="intent-bar">
          <p className="intent-empty">Spectating — both hands hidden; intents disabled</p>
        </div>
      )}

      {over ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h2>Match over</h2>
            <p>
              {`Winner: seat ${matchOver?.winner ?? view.winner}\nReason: ${
                matchOver?.reason ?? view.winReason ?? "—"
              }`}
            </p>
            <button type="button" className="leave-btn" onClick={onLeave}>
              Return home
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
