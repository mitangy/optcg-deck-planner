import type { PlayerView, Seat } from "../net/protocol";

export type WaitingKind = "block" | "counter" | "trigger" | "effect" | "mulligan" | "turn";

export type WaitingOnOpponent = {
  kind: WaitingKind;
  /** Short line shown big: always names the opponent. */
  title: string;
  /** What they are deciding, e.g. "Choosing a counter". */
  detail: string;
  /** A real answer is awaited (pulses). Their ordinary turn is not. */
  urgent: boolean;
};

const BY_KIND: Record<WaitingKind, { detail: string; urgent: boolean }> = {
  block: { detail: "Choosing a blocker", urgent: true },
  counter: { detail: "Choosing a counter", urgent: true },
  trigger: { detail: "Deciding on a Trigger", urgent: true },
  effect: { detail: "Resolving an effect choice", urgent: true },
  mulligan: { detail: "Deciding on a mulligan", urgent: true },
  turn: { detail: "Opponent's turn", urgent: false },
};

function waiting(kind: WaitingKind): WaitingOnOpponent {
  const { detail, urgent } = BY_KIND[kind];
  return {
    kind,
    title: kind === "turn" ? "Opponent's turn" : "Waiting for opponent",
    detail: kind === "turn" ? "They are playing" : detail,
    urgent,
  };
}

/**
 * What the game is waiting on the opponent for, when you have nothing to do.
 * Null whenever you can act (any legal intent) or the match is not live.
 */
export function waitingOnOpponent(
  view: PlayerView | null,
  mySeat: Seat | null,
): WaitingOnOpponent | null {
  if (!view || mySeat == null || view.spectator || view.winner != null) return null;

  const front = view.pendingChoices?.[0];
  if (front) {
    if (front.seat === mySeat) return null;
    return waiting(front.kind === "life_trigger" ? "trigger" : "effect");
  }
  if (view.phase === "mulligan") {
    return view.you.mulliganDone && !view.opponent.mulliganDone ? waiting("mulligan") : null;
  }
  if (view.legalIntents.length > 0) return null;

  const battle = view.battle as { attackerSeat?: unknown } | null;
  if (battle && battle.attackerSeat === mySeat) {
    if (view.phase === "block") return waiting("block");
    if (view.phase === "counter") return waiting("counter");
  }
  return view.activeSeat !== mySeat ? waiting("turn") : null;
}
