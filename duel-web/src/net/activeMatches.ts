/** Live matches this account holds a seat in, for moving a match to another device (#451). */
import type { MatchResumeBlob } from "./matchResume";
import type { Seat } from "./protocol";

export type ActiveMatch = {
  roomId: string;
  seats: Seat[];
  /** Both seats are this account (hotseat practice). */
  practice: boolean;
  ranked: boolean;
  phase: "waiting" | "playing" | "finished";
};

/** The game server's HTTP origin (the Colyseus SDK derives ws(s) from http(s); this goes back). */
export function gameServerHttpUrl(serverUrl: string): string {
  return serverUrl.replace(/^ws(s?):\/\//i, "http$1://").replace(/\/+$/, "");
}

/**
 * `GET /active-matches` with the account's game token. Resolves [] on any
 * failure: this only feeds an optional lobby card.
 */
export async function fetchActiveMatches(
  serverUrl: string,
  gameToken: string,
  signal?: AbortSignal,
): Promise<ActiveMatch[]> {
  try {
    const res = await fetch(`${gameServerHttpUrl(serverUrl)}/active-matches`, {
      headers: { Authorization: `Bearer ${gameToken}` },
      signal,
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { matches?: unknown };
    if (!Array.isArray(body.matches)) return [];
    const out: ActiveMatch[] = [];
    for (const raw of body.matches) {
      const m = raw as Partial<ActiveMatch> | null;
      if (!m || typeof m.roomId !== "string" || !m.roomId) continue;
      const seats = Array.isArray(m.seats) ? m.seats.filter((s): s is Seat => s === 0 || s === 1) : [];
      if (seats.length === 0) continue;
      out.push({
        roomId: m.roomId,
        seats,
        practice: m.practice === true,
        ranked: m.ranked === true,
        phase: m.phase === "waiting" || m.phase === "finished" ? m.phase : "playing",
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * The match to offer as "in progress on another device": the first one this
 * tab's own resume blob does not already cover (that has its own card).
 */
export function pickOtherDeviceMatch(
  matches: ActiveMatch[],
  localResume: Pick<MatchResumeBlob, "roomId"> | null,
): ActiveMatch | null {
  return matches.find((m) => m.phase !== "finished" && m.roomId !== localResume?.roomId) ?? null;
}

export function activeMatchModeLabel(m: Pick<ActiveMatch, "practice" | "ranked">): string {
  return m.practice ? "practice" : m.ranked ? "ranked" : "private room";
}
