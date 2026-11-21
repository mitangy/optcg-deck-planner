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

export function invitableFriends(friends: readonly Friend[], players: readonly TournamentPlayer[], query = ""): Friend[] {
  const taken = new Set(players.map((p) => p.user_id));
  const q = query.trim().toLowerCase();
  return friends
    .filter((f) => !taken.has(f.user_id) && (q === "" || f.username.toLowerCase().includes(q)))
    .sort((x, y) => Number(x.status === "offline") - Number(y.status === "offline") || x.username.localeCompare(y.username));
}

export type YourMatchState = "opponent-waiting" | "you-hosting" | "ready";

/** Whether the room for a ready match is already open, and who opened it. */
export function yourMatchState(m: Pick<TournamentMatch, "room_open" | "host_id">, myId: number): YourMatchState {
  if (!m.room_open) return "ready";
  return m.host_id === myId ? "you-hosting" : "opponent-waiting";
}

export function playLabel(state: YourMatchState): string {
  return state === "opponent-waiting" ? "Join now" : state === "you-hosting" ? "Rejoin room" : "Play";
}

/** Only your next match gets a Play button; your other ready matches wait. */
export function offersPlay(m: Pick<TournamentMatch, "id" | "status">, next: Pick<TournamentMatch, "id"> | null): boolean {
  return m.status === "ready" && next !== null && next.id === m.id;
}

/** The two matches that feed a bracket match (round r, slot s <- round r-1, slots 2s and 2s+1). */
export function feederMatches(matches: readonly TournamentMatch[], m: Pick<TournamentMatch, "round" | "slot">): TournamentMatch[] {
  if (m.round <= 1) return [];
  return matches.filter((x) => x.round === m.round - 1 && (x.slot === m.slot * 2 || x.slot === m.slot * 2 + 1)).sort((x, y) => x.slot - y.slot);
}

/** For a match you are waiting on: the two players of the other feeder match, when both are known and it is undecided. */
export function pendingFeederPlayers(matches: readonly TournamentMatch[], m: TournamentMatch, myId: number): [Person, Person] | null {
  const other = feederMatches(matches, m).find((f) => f.a?.user_id !== myId && f.b?.user_id !== myId);
  return other?.a && other.b && other.winner_id === null ? [other.a, other.b] : null;
}

/** The round a phone shows first: your next match, else the latest round with a ready match, else round 1 (the final once all are done). */
export function defaultPhoneRound(matches: readonly TournamentMatch[], next: Pick<TournamentMatch, "round"> | null): number {
  if (next) return next.round;
  const ready = matches.filter((m) => m.status === "ready").map((m) => m.round);
  if (ready.length > 0) return Math.max(...ready);
  const rounds = matches.map((m) => m.round);
  return rounds.length > 0 && matches.every((m) => m.status === "done") ? Math.max(...rounds) : 1;
}

/** Round robin: a round with every match done starts collapsed; any unfinished round (including the one with your next match) starts open. */
export function roundStartsOpen(matches: readonly TournamentMatch[]): boolean {
  return !matches.every((m) => m.status === "done");
}

export function matchStatusLabel(m: TournamentMatch): string {
  if (m.status === "done") {
    if (m.decided_by === "bye") return "Bye";
    return m.decided_by === "walkover" ? "Win awarded" : "Played";
  }
  if (m.status === "waiting") return "Waiting";
  return m.room_open ? "Room open" : "Ready";
}
