/**
 * A finished game as one player saw it: the replay re-run, every event projected
 * for that seat (the opponent's hand, deck and face-down cards stay hidden) and
 * grouped by turn. This is what a player's match history shows; the full replay
 * never leaves the server.
 *
 * Opponent hands stay hidden while the game can still be played. Only with
 * `revealOpponent` (a finished or cut-off game) does the log also carry the
 * other seat's actual hand at each turn start and after mulligans.
 */
import { projectGameEvents } from "./engine.js";
import { replayMatch, type MatchReplay } from "./matchReplay.js";
import type { CardDefId, GameEvent, InstanceId, MatchState, Seat } from "./types.js";

export const SEAT_LOG_SCHEMA = 1;

export interface SeatLogTurn {
  /** The engine's turn number; 0 is the mulligan step when it was played. */
  turn: number;
  activeSeat: Seat;
  events: GameEvent[];
  /** Your hand at the start of this turn, after the draw step. Absent in logs stored before this was recorded. */
  hand?: CardDefId[];
  /** How many cards the opponent held then (never which ones). */
  opponentHandCount?: number;
  /** The opponent's actual hand at the same moment. Only present when the log was built with `revealOpponent`. */
  opponentHand?: CardDefId[];
}

export interface SeatLog {
  schema: typeof SEAT_LOG_SCHEMA;
  seat: Seat;
  /** Your hand once mulligans were done. */
  openingHand: CardDefId[];
  /** The opponent's hand once mulligans were done. Only present when the log was built with `revealOpponent`. */
  opponentOpeningHand?: CardDefId[];
  turns: SeatLogTurn[];
  /** Every Leader, Character and Stage that was on the board, so attackers and blockers can be named. */
  boardCards: [InstanceId, CardDefId, Seat][];
  /** Set when the engine could no longer replay the game; the log stops there. */
  diverged?: string;
}

function recordHand(turn: SeatLogTurn, state: MatchState, seat: Seat, revealOpponent: boolean) {
  const other = state.players[(1 - seat) as Seat];
  turn.hand = state.players[seat].hand.map((c) => c.defId);
  turn.opponentHandCount = other.hand.length;
  if (revealOpponent) turn.opponentHand = other.hand.map((c) => c.defId);
}

function indexBoard(state: MatchState, into: Map<InstanceId, [InstanceId, CardDefId, Seat]>) {
  for (const seat of [0, 1] as Seat[]) {
    const p = state.players[seat];
    for (const c of [p.leader, ...p.characters, ...(p.stage ? [p.stage] : [])]) {
      if (!into.has(c.id)) into.set(c.id, [c.id, c.defId, seat]);
    }
  }
}

export function seatLog(replay: MatchReplay, seat: Seat, opts: { revealOpponent?: boolean } = {}): SeatLog {
  const reveal = opts.revealOpponent === true;
  const other = (1 - seat) as Seat;
  const opening = replayMatch({ ...replay, intents: [] });
  const board = new Map<InstanceId, [InstanceId, CardDefId, Seat]>();
  indexBoard(opening, board);
  const handOf = (state: MatchState, s: Seat) => state.players[s].hand.map((c) => c.defId);
  let openingHand = opening.phase === "mulligan" ? null : handOf(opening, seat);
  let opponentOpeningHand = reveal && opening.phase !== "mulligan" ? handOf(opening, other) : null;
  let current: SeatLogTurn = { turn: opening.turnNumber, activeSeat: opening.activeSeat, events: [] };
  const turns: SeatLogTurn[] = [current];
  if (opening.phase !== "mulligan" && current.turn > 0) recordHand(current, opening, seat, reveal);
  let diverged: string | undefined;
  try {
    replayMatch(replay, (step) => {
      let started: SeatLogTurn | null = null;
      for (const event of projectGameEvents(step.events, seat)) {
        // The engine starts every turn (extra turns included) with a refresh phase and counts it.
        if (event.type === "phase_changed" && event.phase === "refresh") {
          current = { turn: current.turn + 1, activeSeat: event.activeSeat, events: [] };
          turns.push(current);
          started = current;
        }
        current.events.push(event);
      }
      indexBoard(step.state, board);
      // The step that opens a turn ends in its main phase, with the draw already done.
      if (started) recordHand(started, step.state, seat, reveal);
      if (openingHand === null && step.state.phase !== "mulligan") {
        openingHand = handOf(step.state, seat);
        if (reveal) opponentOpeningHand = handOf(step.state, other);
      }
    });
  } catch (err) {
    diverged = err instanceof Error ? err.message : String(err);
  }
  return {
    schema: SEAT_LOG_SCHEMA,
    seat,
    openingHand: openingHand ?? handOf(opening, seat),
    ...(reveal ? { opponentOpeningHand: opponentOpeningHand ?? handOf(opening, other) } : {}),
    turns: turns.filter((t) => t.events.length > 0),
    boardCards: [...board.values()],
    ...(diverged ? { diverged } : {}),
  };
}
