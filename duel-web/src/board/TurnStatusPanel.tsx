import type { CSSProperties } from "react";
import type { PlayerView, Seat, SeatPlayers } from "../net/protocol";
import { cardBackCssValue } from "../cardBack";
import { fanPose } from "./handFan";
import { playerLabel, seatName } from "./playerNames";
import { CardTile } from "./CardTile";
import { respondSubline } from "./promptLine";

/** Formatted per-player (chess) clocks; `running` is whose is ticking. */
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

function PlayerRow({ side, stats }: { side: "you" | "opp"; stats: SideStats }) {
  return (
    <div
      className={`turn-player turn-player-${side}${stats.active ? " is-active" : ""}`}
      aria-current={stats.active ? "true" : undefined}
    >
      <div className="turn-player-head">
        <span className="turn-player-dot" aria-hidden />
        <span className="turn-player-name" title={stats.name}>
          {stats.name}
        </span>
        {stats.clock ? (
          <span
            className={`turn-player-clock${stats.clock.running ? " running" : ""}${
              stats.clock.low ? " low" : ""
            }`}
            title="Time left"
          >
            {stats.clock.text}
          </span>
        ) : null}
        <span className={`turn-order-badge ${stats.order}`}>
          {stats.order === "first" ? "1st" : "2nd"}
        </span>
      </div>
      <dl className="turn-player-stats">
        <div>
          <dt>Life</dt>
          <dd>{stats.life}</dd>
        </div>
        <div>
          <dt>Hand</dt>
          <dd>{stats.hand}</dd>
        </div>
        <div>
          <dt>Deck</dt>
          <dd>{stats.deck}</dd>
        </div>
        <div>
          <dt>DON!!</dt>
          <dd>
            {stats.donActive}/{stats.donTotal}
          </dd>
        </div>
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
  /** Timers already formatted ("0:25"), or null when off. */
  turnClock: string | null;
  matchClock: string | null;
  seatClocks?: SeatClocks | null;
  /** Landscape phones: just the whose-turn banner and the clocks. */
  compact?: boolean;
};

/**
 * Right-rail game state: a big whose-turn banner, then both players with
 * turn order, Life, hand, deck and DON!!. Opponent on top, you below — the
 * same order as the mats.
 */
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
        <strong className="turn-banner-title">{title}</strong>
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
              donTotal: opp.costAreaCount,
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
              donTotal: you.costArea.length,
            }}
          />
        </>
      )}
    </section>
  );
}

type HandCard = { id: string; defId: string };

/** Opponent's hand size as a number, so nobody has to count the backs. */
export function OppHandCount({ count }: { count: number }) {
  return (
    <span className="opp-hand-count" aria-hidden="true">
      {count}
    </span>
  );
}

/** Narrow layouts: a row of small backs (capped at 8) above the opponent's mat. */
export function OppHandHint({
  count,
  cardBackUrl,
  cards,
  ownerSeat,
}: {
  count: number;
  cardBackUrl: string | null;
  /** Spectators of unranked rooms: the far player's hand, face up. */
  cards?: readonly HandCard[];
  ownerSeat?: Seat;
}) {
  return (
    <div className="opp-hand-hint" aria-label={`Opponent hand: ${count} cards`}>
      <span className="opp-hand-label">Opp hand</span>
      {cards ? (
        <div
          className="opp-hand-backs opp-hand-faces"
          style={{ "--n": Math.max(cards.length, 1) } as CSSProperties}
        >
          {cards.map((c) => (
            <CardTile
              key={c.id}
              defId={c.defId}
              ownerSeat={ownerSeat}
              inspectOnClick
              classNameExtra="opp-hand-face"
            />
          ))}
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

/**
 * Opponent's hand as a fan of backs in the top-right corner (the "Opponent
 * hand, top right" setting): bigger cards on the same arc as your own hand,
 * hanging from the top edge, with the count beside them. Narrow layouts get
 * `row`: a right-aligned overlapping strip in the opponent hint row. `mat`:
 * the same fan pinned above the playmat (desktop "oppHandSpot").
 */
export function OppHandCorner({
  count,
  cardBackUrl,
  variant,
}: {
  count: number;
  cardBackUrl: string | null;
  variant: "fan" | "row" | "mat";
}) {
  const shown = Math.min(count, variant === "row" ? 8 : 10);
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

/** Opponent's hand as fanned backs hanging from the top of the rail. */
export function OppHandFan({
  count,
  cardBackUrl,
  compact = false,
  cards,
  ownerSeat,
}: {
  count: number;
  cardBackUrl: string | null;
  /** Landscape phones: a one-line count, no fan. */
  compact?: boolean;
  /** Spectators of unranked rooms: the far player's hand, face up. */
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
        <span className="card-back" aria-hidden />
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
          ? cards.map((c, i) => (
              <CardTile
                key={c.id}
                defId={c.defId}
                ownerSeat={ownerSeat}
                inspectOnClick
                classNameExtra="opp-fan-card opp-fan-face"
                style={{ "--i": i - mid } as CSSProperties}
              />
            ))
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
