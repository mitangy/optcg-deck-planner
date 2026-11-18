import type { Friend } from "../friends/friendsApi";
import type { Person, Tournament, TournamentFormat, TournamentMatch, TournamentPlayer } from "./tournamentApi";

export const SINGLE_ELIM_SIZES = [4, 8, 16] as const;
export const ROUND_ROBIN_SIZES = [3, 4, 5, 6, 7, 8] as const;

export function roundLabel(round: number, rounds: number): string {
  const fromEnd = rounds - round;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semifinals";
  if (fromEnd === 2) return "Quarterfinals";
  if (fromEnd === 3) return "Round of 16";
  return `Round ${round}`;
}

export function formatLabel(t: { format: TournamentFormat; size: number }): string {
  return t.format === "single_elim"
    ? `Single elimination · ${t.size} players · Bo1`
    : "Round robin · Bo1";
}

export function minPlayers(format: TournamentFormat, size: number): number {
  return format === "single_elim" ? size / 2 + 1 : 3;
}

export function joinedCount(players: readonly TournamentPlayer[]): number {
  return players.filter((p) => p.status === "joined").length;
}

export function startBlocker(t: Pick<Tournament, "format" | "size" | "players">): string | null {
  const need = minPlayers(t.format, t.size);
  return joinedCount(t.players) >= need ? null : `Need at least ${need} players.`;
}

export function groupByRound(matches: readonly TournamentMatch[]): { round: number; matches: TournamentMatch[] }[] {
  const byRound = new Map<number, TournamentMatch[]>();
  for (const m of matches) byRound.set(m.round, [...(byRound.get(m.round) ?? []), m]);
  return [...byRound.entries()]
    .sort(([a], [b]) => a - b)
    .map(([round, list]) => ({ round, matches: list.sort((x, y) => x.slot - y.slot) }));
}

const includes = (m: TournamentMatch, userId: number) => m.a?.user_id === userId || m.b?.user_id === userId;

export function myNextMatch(t: Pick<Tournament, "matches" | "status">, myId: number): TournamentMatch | null {
  if (t.status !== "running") return null;
  const mine = t.matches.filter((m) => includes(m, myId));
  const ordered = [...mine].sort((x, y) => x.round - y.round || x.slot - y.slot);
  return ordered.find((m) => m.status === "ready") ?? ordered.find((m) => m.status === "waiting") ?? null;
}

export function opponentOf(m: TournamentMatch, myId: number): Person | null {
  if (m.a?.user_id === myId) return m.b;
  return m.b?.user_id === myId ? m.a : null;
}

export function invitableFriends(friends: readonly Friend[], players: readonly TournamentPlayer[]): Friend[] {
  const taken = new Set(players.map((p) => p.user_id));
  return friends.filter((f) => !taken.has(f.user_id));
}

export function matchStatusLabel(m: TournamentMatch): string {
  if (m.status === "done") {
    if (m.decided_by === "bye") return "Bye";
    return m.decided_by === "walkover" ? "Win awarded" : "Played";
  }
  if (m.status === "waiting") return "Waiting";
  return m.room_open ? "Room open" : "Ready";
}
