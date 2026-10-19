/** Numbers for the Your voyage card. */

export type Streak = { won: boolean; count: number };

/**
 * The run of equal results from the newest finished game. Games that were cut
 * off never sent a result, so they neither extend nor break a streak.
 * `games` is newest first.
 */
export function streak(games: { won: boolean; finished?: boolean }[]): Streak | null {
  let run: Streak | null = null;
  for (const g of games) {
    if (g.finished === false) continue;
    if (!run) run = { won: g.won, count: 1 };
    else if (run.won === g.won) run.count += 1;
    else break;
  }
  return run;
}

export function streakLabel(s: Streak | null): string {
  return s ? `${s.won ? "W" : "L"}${s.count}` : "—";
}

export function recordLabel(wins: number, losses: number): string {
  return `${wins}–${losses}`;
}
