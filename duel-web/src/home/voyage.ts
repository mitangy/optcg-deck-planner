export type Streak = { won: boolean; count: number };

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
