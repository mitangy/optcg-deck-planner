/** How one finished duel reads in the match history list. */
import type { MatchHistoryEntry } from "./historyApi";

const REASONS: Record<string, string> = {
  concede: "conceded",
  timeout: "ran out of time",
  match_timeout: "match clock ran out",
  abandoned: "left the game",
  disconnect: "disconnected",
  deck_out: "decked out",
  leader_battle_at_zero_life: "took the last hit",
  card_effect: "card effect",
};

export type MatchRow = {
  id: string;
  /** "Cut off": the game never sent a result (server restart, both players gone). */
  outcome: "Won" | "Lost" | "Cut off";
  /** Who the reason applies to, e.g. "Opponent conceded". */
  how: string;
  yourLeader: string;
  /** Card id of your Leader, for its art on the row. */
  yourLeaderId: string | null;
  opponentLeader: string;
  opponent: string;
  turns: string | null;
  /** Bounty change, e.g. "+16" or "−12"; null for unranked games. */
  bountyDelta: string | null;
  when: string | null;
};

/** The row's `data-outcome`, which colours its edge. */
export function outcomeKey(outcome: MatchRow["outcome"]): "won" | "lost" | "unfinished" {
  return outcome === "Won" ? "won" : outcome === "Lost" ? "lost" : "unfinished";
}

export function matchRow(
  m: MatchHistoryEntry,
  cardName: (id: string) => string,
  now: Date = new Date(),
): MatchRow {
  const reason = REASONS[m.reason] ?? m.reason.replace(/_/g, " ");
  // Concede / time / leave reasons describe the loser; the rest describe how the game was won.
  const loserReasons = new Set(["concede", "timeout", "match_timeout", "abandoned", "disconnect", "deck_out", "leader_battle_at_zero_life"]);
  const how = loserReasons.has(m.reason) ? `${m.won ? "Opponent" : "You"} ${reason}` : capitalize(reason);
  const delta = m.rating_after - m.rating_before;
  const unfinished = m.finished === false;
  return {
    id: m.match_id,
    outcome: unfinished ? "Cut off" : m.won ? "Won" : "Lost",
    how: unfinished ? "Game didn't finish" : how,
    yourLeader: m.your_leader_id ? cardName(m.your_leader_id) : "Unknown leader",
    yourLeaderId: m.your_leader_id,
    opponentLeader: m.opponent_leader_id ? cardName(m.opponent_leader_id) : "Unknown leader",
    opponent: m.opponent_name,
    turns: m.turns != null ? `${m.turns} turns` : null,
    bountyDelta: m.ranked && !unfinished ? (delta >= 0 ? `+${delta}` : `−${Math.abs(delta)}`) : null,
    when: m.created_at ? relativeTime(new Date(m.created_at), now) : null,
  };
}

function capitalize(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

function relativeTime(then: Date, now: Date): string {
  const mins = Math.round((now.getTime() - then.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
