import { useState } from "react";
import type { Intent, MatchOverMessage, PlayerView, Seat } from "../net/protocol";
import { CardTile } from "./CardTile";
import { IntentBar } from "./IntentBar";
import { SideField } from "./SideField";

type Props = {
  view: PlayerView | null;
  seat: Seat | null;
  matchId: string | null;
  errorBanner: string | null;
  matchOver: MatchOverMessage["result"] | null;
  onSendIntent: (intent: Intent) => void;
  onLeave: () => void;
  onClearError: () => void;
};

export function DuelBoard({
  view,
  seat,
  matchId,
  errorBanner,
  matchOver,
  onSendIntent,
  onLeave,
  onClearError,
}: Props) {
  const [handFilter, setHandFilter] = useState<number | null>(null);
  const over = matchOver != null || view?.winner != null;

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
  const mySeat = seat ?? view.seat;
  const yourTurn = view.activeSeat === mySeat && !over;

  return (
    <div className={`board-root arena${yourTurn ? " your-turn" : ""}`}>
      <header className="hud-bar">
        <div className="hud-brand">OPTCG DUEL</div>
        <div className={`hud-status${yourTurn ? " pulse" : ""}`}>
          <span className="hud-phase">{view.phase}</span>
          <span className="hud-sep">·</span>
          <span>Turn {view.turnNumber}</span>
          <span className="hud-sep">·</span>
          <span>Seat {mySeat}</span>
          {yourTurn ? <span className="hud-turn-chip">YOUR TURN</span> : null}
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
          />
        </div>
      </div>

      <div className="hand-rail">
        <div className="hand-rail-head">
          <span className="hand-rail-title">Hand</span>
          <span className="hand-rail-count">{you.hand.length}</span>
        </div>
        <div className="hand-row">
          {you.hand.map((c, idx) => (
            <CardTile
              key={c.id}
              defId={c.defId}
              selected={handFilter === idx}
              onClick={() => setHandFilter((prev) => (prev === idx ? null : idx))}
            />
          ))}
        </div>
      </div>

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
