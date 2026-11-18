import type { BattleLogEntry } from "../match/battleLog";

export type OpponentReveal = { entryId: string; defId: string; turn: number };

// A previous id gone from the log means the log was replaced (resync / undo), not news.
export function entriesSince(
  prevLastId: string | null | undefined,
  entries: readonly BattleLogEntry[],
): readonly BattleLogEntry[] {
  if (prevLastId === undefined) return [];
  let from = 0;
  if (prevLastId !== null) {
    const at = entries.findIndex((e) => e.id === prevLastId);
    if (at < 0) return [];
    from = at + 1;
  }
  return entries.slice(from);
}

export function newOpponentReveals(
  prevLastId: string | null | undefined,
  entries: readonly BattleLogEntry[],
  oppSeat: 0 | 1,
): OpponentReveal[] {
  const out: OpponentReveal[] = [];
  for (const e of entriesSince(prevLastId, entries)) {
    if (e.reveal && e.reveal.ownerSeat === oppSeat) {
      out.push({ entryId: e.id, defId: e.reveal.defId, turn: e.turn });
    }
  }
  return out;
}
