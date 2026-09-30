import type { BattleLogEntry } from "./battleLog";
import { cardUseOf } from "./opponentPlay";

export type RecentPlay = {
  entryId: string;
  defId: string;
  ownerSeat: 0 | 1;
  mine: boolean;
  turn: number;
  verb: string;
  /** Accessible label, e.g. "Opponent played OP01-001, turn 5". */
  label: string;
};

export const RECENT_PLAYS_LIMIT = 6;

/** Last card uses by either player, newest first (same tone rules as the idle preview). */
export function recentPlays(
  entries: readonly BattleLogEntry[],
  youSeat: 0 | 1,
  limit: number = RECENT_PLAYS_LIMIT,
  nameOf: (defId: string) => string = (d) => d,
): RecentPlay[] {
  const out: RecentPlay[] = [];
  for (let i = entries.length - 1; i >= 0 && out.length < limit; i--) {
    const e = entries[i]!;
    const use = cardUseOf(e);
    if (!use) continue;
    const mine = use.ownerSeat === youSeat;
    out.push({
      entryId: e.id,
      defId: use.defId,
      ownerSeat: use.ownerSeat,
      mine,
      turn: e.turn,
      verb: use.verb,
      label: `${mine ? "You" : "Opponent"} ${use.verb} ${nameOf(use.defId)}, turn ${e.turn}`,
    });
  }
  return out;
}
