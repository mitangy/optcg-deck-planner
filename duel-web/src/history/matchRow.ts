import type { MatchHistoryEntry } from "./historyApi";
import { historyAgo } from "../lib/relativeTime";

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
  outcome: "Won" | "Lost" | "Cut off";
  how: string;
  yourLeader: string;
  yourLeaderId: string | null;
  opponentLeader: string;
  opponentLeaderId: string | null;
  /** Ranked or Casual, written out so the row never says it with colour alone. */
  mode: "Ranked" | "Casual";
  opponent: string;
  turns: string | null;
  bountyDelta: string | null;
  when: string | null;
  replay: boolean;
  hasChat: boolean;
};

export function outcomeKey(outcome: MatchRow["outcome"]): "won" | "lost" | "unfinished" {
  return outcome === "Won" ? "won" : outcome === "Lost" ? "lost" : "unfinished";
}

export function matchRow(
  m: MatchHistoryEntry,
  cardName: (id: string) => string,
  now: Date = new Date(),
): MatchRow {
  const reason = REASONS[m.reason] ?? m.reason.replace(/_/g, " ");
  const loserReasons = new Set(["concede", "timeout", "match_timeout", "abandoned", "disconnect", "deck_out", "leader_battle_at_zero_life"]);
  // "match clock ran out" needs a possessive: "Your match clock ran out", not "You match clock ran out" (#1388).
  const who = m.reason === "match_timeout" ? (m.won ? "Opponent's" : "Your") : m.won ? "Opponent" : "You";
  const how = loserReasons.has(m.reason) ? `${who} ${reason}` : capitalize(reason);
  const delta = m.rating_after - m.rating_before;
  const unfinished = m.finished === false;
  return {
    id: m.match_id,
    outcome: unfinished ? "Cut off" : m.won ? "Won" : "Lost",
    how: unfinished ? "Game didn't finish" : how,
    yourLeader: m.your_leader_id ? cardName(m.your_leader_id) : "Unknown leader",
    yourLeaderId: m.your_leader_id,
    opponentLeader: m.opponent_leader_id ? cardName(m.opponent_leader_id) : "Unknown leader",
    opponentLeaderId: m.opponent_leader_id,
    mode: m.ranked ? "Ranked" : "Casual",
    opponent: m.opponent_name,
    turns: m.turns != null ? `${m.turns} turns` : null,
    bountyDelta: m.ranked && !unfinished ? (delta >= 0 ? `+${delta}` : `−${Math.abs(delta)}`) : null,
    when: m.created_at ? historyAgo(new Date(m.created_at), now) : null,
    replay: m.replay_ready === true,
    hasChat: m.has_chat === true,
  };
}

function capitalize(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}
