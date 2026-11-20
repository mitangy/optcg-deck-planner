// Remembers that the game on screen is a tournament match, so Match over can offer
// "Back to tournament". Set when a tournament match launches, cleared by any other launch.
export type ActiveTournamentMatch = { code: string; matchId: number };

const KEY = "duel.activeTournamentMatch";
let memory: ActiveTournamentMatch | null = null;

function isActive(v: unknown): v is ActiveTournamentMatch {
  const o = v as ActiveTournamentMatch | null;
  return !!o && typeof o.code === "string" && o.code !== "" && typeof o.matchId === "number";
}

export function setActiveTournamentMatch(m: ActiveTournamentMatch): void {
  memory = m;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    // the in-memory copy still serves this tab
  }
}

export function getActiveTournamentMatch(): ActiveTournamentMatch | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isActive(parsed)) return parsed;
    }
  } catch {
    // fall through to memory
  }
  return memory;
}

export function clearActiveTournamentMatch(): void {
  memory = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // nothing stored
  }
}

/** The tournament code to go back to from Match over, or null for a spectator, a replay or a non-tournament game. */
export function tournamentReturnFor(
  active: ActiveTournamentMatch | null,
  game: { spectating: boolean; isReplay: boolean },
): string | null {
  if (!active || game.spectating || game.isReplay) return null;
  return active.code;
}
