import type { BattleLogEntry } from "./battleLog";

export type OpponentReveal = { entryId: string; defId: string; turn: number };

/**
 * Opponent reveals among the log entries added since `prevLastId` (the newest
 * entry id seen last time): undefined before the first look (mount: none),
 * null when the log was empty. A previous id that is gone from the log means
 * the log was replaced (resync / undo), which is not news either.
 */
export function newOpponentReveals(
  prevLastId: string | null | undefined,
  entries: readonly BattleLogEntry[],
  oppSeat: 0 | 1,
): OpponentReveal[] {
  if (prevLastId === undefined) return [];
  let from = 0;
  if (prevLastId !== null) {
    const at = entries.findIndex((e) => e.id === prevLastId);
    if (at < 0) return [];
    from = at + 1;
  }
  const out: OpponentReveal[] = [];
  for (const e of entries.slice(from)) {
    if (e.reveal && e.reveal.ownerSeat === oppSeat) {
      out.push({ entryId: e.id, defId: e.reveal.defId, turn: e.turn });
    }
  }
  return out;
}
