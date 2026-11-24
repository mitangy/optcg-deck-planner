import { narrateEvents, type BattleLogEntry, type InstanceIndex } from "../board/match/battleLog";
import type { SeatLogJson } from "./historyApi";

export type MatchLogTurn = {
  turn: number;
  label: string;
  yours: boolean;
  entries: BattleLogEntry[];
  hand?: string[];
  opponentHandCount?: number;
  opponentHand?: string[];
};

export function matchLogTurns(log: SeatLogJson): MatchLogTurn[] {
  const instances: InstanceIndex = new Map(log.boardCards.map(([id, defId, seat]) => [id, { defId, seat }]));
  const turns: MatchLogTurn[] = [];
  for (const t of log.turns) {
    const events = t.events.filter((e) => (e as { type?: string }).type !== "phase_changed");
    const entries = narrateEvents(events, { youSeat: log.seat, turnNumber: t.turn, instances });
    if (!entries.length) continue;
    const yours = t.activeSeat === log.seat;
    turns.push({
      turn: t.turn,
      label: t.turn === 0 ? "Before the game" : yours ? "Your turn" : "Opponent's turn",
      yours: t.turn !== 0 && yours,
      entries,
      ...(t.hand ? { hand: t.hand } : {}),
      ...(t.opponentHandCount != null ? { opponentHandCount: t.opponentHandCount } : {}),
      ...(t.opponentHand ? { opponentHand: t.opponentHand } : {}),
    });
  }
  return turns;
}

export function groupHand(defIds: string[]): { defId: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const id of defIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([defId, count]) => ({ defId, count }));
}
