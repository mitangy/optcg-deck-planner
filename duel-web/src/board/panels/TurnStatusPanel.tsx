import type { CSSProperties } from "react";
import type { PlayerView, Seat, SeatPlayers } from "../../net/protocol";
import { cardBackCssValue } from "../../cardBack";
import { fanPose } from "../hand/handFanGeometry";
import { playerLabel, seatName } from "../match/playerNames";
import { CardTile } from "../zones/CardTile";
import { HIDDEN_HAND_DEF } from "../hand/handReveal";
import { respondSubline } from "../prompts/promptLine";
import { donTotal } from "../don/donTotals";

export type SeatClocks = {
  you: string;
  opp: string;
  youLow: boolean;
  oppLow: boolean;
  running: "you" | "opp" | null;
};

type SideStats = {
  name: string;
  clock?: { text: string; running: boolean; low: boolean };
  order: "first" | "second";
  active: boolean;
  life: number;
  hand: number;
  deck: number;
  donActive: number;
  donTotal: number;
};

const STAT_GLYPHS = {
  life: "M12 21s-7-4.6-9.2-9.2C1.2 8.3 3 5 6.2 5c2 0 3.4 1.1 5.8 3.6C14.4 6.1 15.8 5 17.800 5 21 5 22.800 8.300 21.200 11.800 19 16.400 12 21 12 21z",
  hand: "M7 3h9a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm1 3v3h7V6z",
  deck: "M8 2h11a2 2 0 0 1 2 2v13h-2V4H8zM5 6h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z",
  don: "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-3 5v10h3.2c2.7 0 4.3-1.8 4.3-5s-1.6-5-4.3-5zm2.2 2h.8c1.3 0 2 1 2 3s-.7 3-2 3h-.8z",
} as const;

function StatGlyph({ kind }: { kind: keyof typeof STAT_GLYPHS }) {
  return (
    <svg className="turn-stat-glyph" viewBox="0 0 24 24" width="11" height="11" aria-hidden focusable="false">
      <path d={STAT_GLYPHS[kind]} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

function StatItem({ kind, label, value }: { kind: keyof typeof STAT_GLYPHS; label: string; value: string }) {
  return (
    <div title={label}>
      <dt>
        <StatGlyph kind={kind} />
        <span className="visually-hidden">{label}</span>
      </dt>
      <dd>{value}</dd>
    </div>
  );
}

// One line per player: the numbers repeat what the board shows, so they only need to be glanceable.
function PlayerRow({ side, stats }: { side: "you" | "opp"; stats: SideStats }) {
  return (
    <div
      className={`turn-player turn-player-${side}${stats.active ? " is-active" : ""}`}
      aria-current={stats.active ? "true" : undefined}
    >
      <span className="turn-player-dot" aria-hidden />
      <span className="turn-player-name" title={stats.name}>
        {stats.name}
      </span>
      <span className={`turn-order-badge ${stats.order}`}>{stats.order === "first" ? "1st" : "2nd"}</span>
      {stats.clock ? (
        <span
          className={`turn-player-clock${stats.clock.running ? " running" : ""}${stats.clock.low ? " low" : ""}`}
          title="Time left"
        >
          {stats.clock.text}
        </span>
      ) : null}
      <dl className="turn-player-stats">
        <StatItem kind="life" label="Life" value={String(stats.life)} />
        <StatItem kind="hand" label="Hand" value={String(stats.hand)} />
        <StatItem kind="deck" label="Deck" value={String(stats.deck)} />
        <StatItem kind="don" label="DON!!" value={`${stats.donActive}/${stats.donTotal}`} />
      </dl>
    </div>
  );
}

type Props = {
  view: PlayerView;
  boardSeat: Seat;
  firstSeat: Seat;
  players: SeatPlayers | null;
  spectating: boolean;
  turnClock: string | null;
  matchClock: string | null;
  seatClocks?: SeatClocks | null;
  compact?: boolean;
};

export function TurnStatusPanel({
  view,
  boardSeat,
  firstSeat,
  players,
  spectating,
  turnClock,
  matchClock,
  seatClocks = null,
  compact = false,
}: Props) {
  const oppSeat: Seat = boardSeat === 0 ? 1 : 0;
  const mulligan = view.phase === "mulligan";
  const over = view.winner != null;
  const youActive = view.activeSeat === boardSeat;
  const mustRespond =
    !spectating && !youActive && !over && !mulligan && view.legalIntents.length > 0;

  const youName = spectating
    ? seatName(players, boardSeat) ?? playerLabel(boardSeat)
    : seatName(players, boardSeat) ?? "You";
  const oppName = seatName(players, oppSeat) ?? (spectating ? playerLabel(oppSeat) : "Opponent");
  const activeName = youActive ? youName : oppName;

  let tone: "mine" | "theirs" | "respond" | "neutral";
  let title: string;
  let sub: string;
  if (over) {
    tone = "neutral";
    title = "Match over";
    sub = "";
  } else if (mulligan) {
    tone = "neutral";
    title = "Mulligan";
    sub = spectating
      ? `${firstSeat === boardSeat ? youName : oppName} goes first`
      : firstSeat === boardSeat
        ? "You go first"
        : "You go second";
  } else if (spectating) {
    tone = "neutral";
    title = `${activeName}'s turn`;
    sub = view.phase;
  } else if (mustRespond) {
    tone = "respond";
    title = "Your response";
    sub = respondSubline({ oppName, phase: view.phase, mySeat: boardSeat, choice: view.pendingChoices?.[0] });
  } else if (youActive) {
    tone = "mine";
    title = "Your turn";
    sub = `${view.phase} phase`;
  } else {
    tone = "theirs";
    title = "Opponent's turn";
    sub = `${oppName} · ${view.phase} phase`;
  }

  // Players see whose turn it is on the action button, so the card does not repeat it as a heading. Spectators have no button, and a finished match has no turn.
  const showTitle = spectating || over;

  const you = view.you;
  const opp = view.opponent;

  return (
    <section className={`turn-panel turn-panel-${tone}`} aria-label="Game state">
      <div className="turn-banner" role="status" aria-live="polite">
        <span className="turn-banner-kicker">
          Turn {Math.max(view.turnNumber, 0)}
          {turnClock ? <span className="turn-banner-clock"> · {turnClock}</span> : null}
          {matchClock ? <span className="turn-banner-clock"> · Match {matchClock}</span> : null}
        </span>
        {showTitle ? <strong className="turn-banner-title">{title}</strong> : null}
        {sub ? <span className="turn-banner-sub">{sub}</span> : null}
      </div>
      {compact ? (
        seatClocks ? (
          <div className="turn-compact-clocks">
            <span
              className={`turn-player-clock${seatClocks.running === "you" ? " running" : ""}${
                seatClocks.youLow ? " low" : ""
              }`}
              title="Your time"
            >
              {spectating ? `S${boardSeat}` : "You"} {seatClocks.you}
            </span>
            <span
              className={`turn-player-clock${seatClocks.running === "opp" ? " running" : ""}${
                seatClocks.oppLow ? " low" : ""
              }`}
              title="Opponent's time"
            >
              {spectating ? `S${oppSeat}` : "Opp"} {seatClocks.opp}
            </span>
          </div>
        ) : null
      ) : (
        <>
          <PlayerRow
            side="opp"
            stats={{
              name: oppName,
              clock: seatClocks
                ? { text: seatClocks.opp, running: seatClocks.running === "opp", low: seatClocks.oppLow }
                : undefined,
              order: firstSeat === oppSeat ? "first" : "second",
              active: !mulligan && !over && !youActive,
              life: opp.lifeCount,
              hand: opp.handCount,
              deck: opp.deckCount,
              donActive: opp.activeDonCount,
              donTotal: donTotal(opp.costAreaCount, opp),
            }}
          />
          <PlayerRow
            side="you"
            stats={{
              name: youName,
              clock: seatClocks
                ? { text: seatClocks.you, running: seatClocks.running === "you", low: seatClocks.youLow }
                : undefined,
              order: firstSeat === boardSeat ? "first" : "second",
              active: !mulligan && !over && youActive,
              life: you.lifeCount,
              hand: spectating ? (you.handCount ?? 0) : you.hand.length,
              deck: you.deckCount,
              donActive: you.activeDonCount,
              donTotal: donTotal(you.costArea.length, you),
            }}
          />
        </>
      )}
    </section>
  );
}

type HandCard = { id: string; defId: string; artCopy?: number };

export function OppHandCount({ count }: { count: number }) {
  return (
    <span className="opp-hand-count" aria-hidden="true">
      {count}
    </span>
  );
}

export function OppHandHint({
  count,
  cardBackUrl,
  cards,
  ownerSeat,
}: {
  count: number;
  cardBackUrl: string | null;
  cards?: readonly HandCard[];
  ownerSeat?: Seat;
}) {
  return (
    <div className="opp-hand-hint" aria-label={`Opponent hand: ${count} cards`}>
      <span className="opp-hand-label">Opp hand</span>
      {cards ? (
        <div
          className="opp-hand-backs opp-hand-faces"
          style={
            {
              "--n": Math.max(cards.length, 1),
              ...(cardBackUrl ? { "--card-back-art": cardBackCssValue(cardBackUrl) } : null),
            } as CSSProperties
          }
        >
          {cards.map((c) =>
            c.defId === HIDDEN_HAND_DEF ? (
              <span key={c.id} className="card-back opp-hand-face" />
            ) : (
              <CardTile
                key={c.id}
                defId={c.defId}
                artCopy={c.artCopy}
                ownerSeat={ownerSeat}
                inspectOnClick
                classNameExtra="opp-hand-face"
              />
            ),
          )}
        </div>
      ) : (
        <div
          className="opp-hand-backs"
          style={
            cardBackUrl
              ? ({ "--card-back-art": cardBackCssValue(cardBackUrl) } as CSSProperties)
              : undefined
          }
        >
          {Array.from({ length: Math.min(count, 8) }).map((_, i) => (
            <span key={i} className="card-back" />
          ))}
        </div>
      )}
      <OppHandCount count={count} />
    </div>
  );
}

export function OppHandCorner({
  count,
  cardBackUrl,
  variant,
  cards,
  ownerSeat,
}: {
  count: number;
  cardBackUrl: string | null;
  variant: "row" | "mat";
  // Same boxes as the backs, so nothing shifts.
  cards?: readonly HandCard[];
  ownerSeat?: Seat;
}) {
  const shown = cards ? Math.min(cards.length, variant === "row" ? 8 : 10) : Math.min(count, variant === "row" ? 8 : 10);
  return (
    <div
      className={`opp-hand-corner opp-hand-corner-${variant}`}
      aria-label={`Opponent hand: ${count} cards`}
      style={
        {
          "--n": Math.max(shown, 1),
          ...(cardBackUrl ? { "--card-back-art": cardBackCssValue(cardBackUrl) } : null),
        } as CSSProperties
      }
    >
      <OppHandCount count={count} />
      <div className="opp-corner-cards">
        {Array.from({ length: shown }).map((_, i) => {
          const pose = fanPose(i, shown);
          const card = cards?.[i];
          if (card && card.defId !== HIDDEN_HAND_DEF) {
            return (
              <CardTile
                key={card.id}
                defId={card.defId}
                artCopy={card.artCopy}
                ownerSeat={ownerSeat}
                inspectOnClick
                classNameExtra="opp-corner-card opp-corner-face"
                style={{ "--rot": `${pose.rot}deg` } as CSSProperties}
              />
            );
          }
          return (
            <span
              key={i}
              className="card-back opp-corner-card"
              style={{ "--rot": `${pose.rot}deg` } as CSSProperties}
            />
          );
        })}
      </div>
    </div>
  );
}

export function OppHandFan({
  count,
  cardBackUrl,
  compact = false,
  cards,
  ownerSeat,
}: {
  count: number;
  cardBackUrl: string | null;
  compact?: boolean;
  cards?: readonly HandCard[];
  ownerSeat?: Seat;
}) {
  if (compact) {
    return (
      <div
        className="opp-hand-compact"
        aria-label={`Opponent hand: ${count} cards`}
        style={
          cardBackUrl
            ? ({ "--card-back-art": cardBackCssValue(cardBackUrl) } as CSSProperties)
            : undefined
        }
      >
        {cards ? (
          cards.slice(0, 10).map((c) =>
            c.defId === HIDDEN_HAND_DEF ? (
              <span key={c.id} className="card-back" aria-hidden />
            ) : (
              <CardTile
                key={c.id}
                defId={c.defId}
                artCopy={c.artCopy}
                ownerSeat={ownerSeat}
                inspectOnClick
                classNameExtra="opp-compact-face"
              />
            ),
          )
        ) : (
          <span className="card-back" aria-hidden />
        )}
        <span className="opp-hand-fan-count">
          <OppHandCount count={count} /> in hand
        </span>
      </div>
    );
  }
  const shown = cards ? cards.length : Math.min(count, 10);
  const mid = (shown - 1) / 2;
  return (
    <div
      className="opp-hand-fan"
      aria-label={`Opponent hand: ${count} cards`}
      style={
        {
          "--n": Math.max(shown, 1),
          ...(cardBackUrl ? { "--card-back-art": cardBackCssValue(cardBackUrl) } : null),
        } as CSSProperties
      }
    >
      <div className="opp-hand-fan-cards">
        {cards
          ? cards.map((c, i) =>
              c.defId === HIDDEN_HAND_DEF ? (
                <span key={c.id} className="card-back opp-fan-card" style={{ "--i": i - mid } as CSSProperties} />
              ) : (
                <CardTile
                  key={c.id}
                  defId={c.defId}
                  artCopy={c.artCopy}
                  ownerSeat={ownerSeat}
                  inspectOnClick
                  classNameExtra="opp-fan-card opp-fan-face"
                  style={{ "--i": i - mid } as CSSProperties}
                />
              ),
            )
          : Array.from({ length: shown }).map((_, i) => (
              <span
                key={i}
                className="card-back opp-fan-card"
                style={{ "--i": i - mid } as CSSProperties}
              />
            ))}
      </div>
      <span className="opp-hand-fan-count">
        <OppHandCount count={count} /> in hand
      </span>
    </div>
  );
}
