import { useState } from "react";
import type { Intent, MatchOverMessage, PlayerView, Seat } from "../net/protocol";
import { CardTile } from "./CardTile";
import { IntentBar } from "./IntentBar";

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
      <div className="board-root">
        <div className="loading">Waiting for match view…</div>
      </div>
    );
  }

  const you = view.you;
  const opp = view.opponent;
  const mySeat = seat ?? view.seat;

  return (
    <div className="board-root">
      <div className="board-chrome">
        <div className="board-chrome-text">
          Phase {view.phase} · Turn {view.turnNumber} · You seat {mySeat}
          {view.activeSeat === mySeat ? " · YOUR TURN" : ""}
        </div>
        <div className="board-chrome-row">
          <div className="match-id" title={matchId ?? undefined}>
            Room {matchId ?? "—"}
          </div>
          <button type="button" className="leave-btn" onClick={onLeave}>
            Leave
          </button>
        </div>
      </div>

      {errorBanner ? (
        <button type="button" className="error-banner" onClick={onClearError}>
          {errorBanner}
        </button>
      ) : null}

      <div className="board-scroll">
        <p className="zone-label">Opponent</p>
        <p className="stats">
          Life {opp.lifeCount} · Hand {opp.handCount} · DON {opp.activeDonCount}/
          {opp.costAreaCount} · Deck {opp.deckCount}
        </p>
        <div className="card-row">
          {opp.stage ? (
            <CardTile defId={opp.stage.defId} compact rested={opp.stage.rested} />
          ) : null}
          {opp.characters.map((c) => (
            <CardTile
              key={c.id}
              defId={c.defId}
              compact
              rested={c.rested}
              power={c.power}
              attachedDonCount={c.attachedDonCount}
            />
          ))}
          <CardTile
            defId={opp.leader.defId}
            compact
            rested={opp.leader.rested}
            power={opp.leader.power}
            attachedDonCount={opp.leader.attachedDonCount}
          />
        </div>

        {Boolean(view.battle || view.pendingTrigger) && (
          <div className="prompt">
            {view.pendingTrigger
              ? `Trigger pending: ${JSON.stringify(view.pendingTrigger)}`
              : `Battle: ${JSON.stringify(view.battle)}`}
          </div>
        )}

        <p className="zone-label spaced">You</p>
        <div className="card-row">
          <CardTile
            defId={you.leader.defId}
            rested={you.leader.rested}
            power={you.leader.power}
            attachedDonCount={you.leader.attachedDonCount}
          />
          {you.characters.map((c) => (
            <CardTile
              key={c.id}
              defId={c.defId}
              rested={c.rested}
              power={c.power}
              attachedDonCount={c.attachedDonCount}
            />
          ))}
          {you.stage ? <CardTile defId={you.stage.defId} rested={you.stage.rested} /> : null}
        </div>
        <p className="stats">
          Life {you.lifeCount} · Active DON {you.activeDonCount} · Cost area{" "}
          {you.costArea.length} · Deck {you.deckCount}
        </p>

        <p className="zone-label">Hand</p>
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
