/** A finished game's turn-by-turn log, as the match page shows it from your seat. */
import { narrateEvents, type BattleLogEntry, type InstanceIndex } from "../board/battleLog";
import type { SeatLogJson } from "./historyApi";

export type MatchLogTurn = {
  turn: number;
  /** "Your turn", "Opponent's turn", or "Before the game" for the mulligan step. */
  label: string;
  yours: boolean;
  entries: BattleLogEntry[];
};

export function matchLogTurns(log: SeatLogJson): MatchLogTurn[] {
  const instances: InstanceIndex = new Map(log.boardCards.map(([id, defId, seat]) => [id, { defId, seat }]));
  const turns: MatchLogTurn[] = [];
  for (const t of log.turns) {
    // Turn headings already say whose turn it is; phase steps are noise here.
    const events = t.events.filter((e) => (e as { type?: string }).type !== "phase_changed");
    const entries = narrateEvents(events, { youSeat: log.seat, turnNumber: t.turn, instances });
    if (!entries.length) continue;
    const yours = t.activeSeat === log.seat;
    turns.push({
      turn: t.turn,
      label: t.turn === 0 ? "Before the game" : yours ? "Your turn" : "Opponent's turn",
      yours: t.turn !== 0 && yours,
      entries,
    });
  }
  return turns;
}
