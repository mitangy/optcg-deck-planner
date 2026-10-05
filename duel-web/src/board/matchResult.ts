/**
 * Human-readable match end reasons.
 *
 * Engine reasons come from `@optcg/rules` `MatchState["winReason"]`
 * (`leader_battle_at_zero_life`, `deck_out`, `card_effect`); the game server
 * adds room-level reasons (`concede`, `match_timeout`, `unknown`). Anything
 * else is humanized so a new server reason never shows up as a raw enum.
 */

import { playerLabel } from "./playerNames";

type Who = { subj: string; poss: string; obj: string };

const YOU: Who = { subj: "You", poss: "Your", obj: "you" };
const OPP: Who = { subj: "Your opponent", poss: "Your opponent's", obj: "your opponent" };

function seatWho(seat: number | null): Who {
  if (seat == null) return { subj: "A player", poss: "A player's", obj: "a player" };
  const name = playerLabel(seat);
  return { subj: name, poss: `${name}'s`, obj: name };
}

/** Short, perspective-free label (battle log, fallback). */
const LABELS: Record<string, string> = {
  leader_battle_at_zero_life: "Leader took damage with 0 Life",
  deck_out: "Deck out",
  card_effect: "Won by a card effect",
  concede: "Concession",
  conceded: "Concession",
  match_timeout: "Match clock ran out",
  turn_timeout: "Turn clock ran out",
  timeout: "Time ran out",
  disconnect: "Opponent disconnected",
  disconnected: "Opponent disconnected",
  opponent_disconnected: "Opponent disconnected",
  abandoned: "Opponent left the match",
  forfeit: "Forfeit",
};

/** Sentence describing why the loser lost, from the viewer's perspective. */
const SENTENCES: Record<string, (loser: Who, winner: Who) => string> = {
  leader_battle_at_zero_life: (l) => `${l.poss} Leader took damage with 0 Life`,
  deck_out: (l) => `${l.poss} deck ran out of cards`,
  card_effect: (_l, w) => `${w.poss} card effect won the game`,
  concede: (l) => `${l.subj} conceded`,
  conceded: (l) => `${l.subj} conceded`,
  match_timeout: (l) => `the match clock ran out on ${l.obj}`,
  turn_timeout: (l) => `the turn clock ran out on ${l.obj}`,
  timeout: (l) => `time ran out on ${l.obj}`,
  disconnect: (l) => `${l.subj} disconnected`,
  disconnected: (l) => `${l.subj} disconnected`,
  opponent_disconnected: (l) => `${l.subj} disconnected`,
  abandoned: (l) => `${l.subj} left the match`,
  forfeit: (l) => `${l.subj} forfeited`,
};

function humanize(reason: string): string {
  const t = reason.replace(/[_-]+/g, " ").trim();
  return t ? t[0]!.toUpperCase() + t.slice(1) : "Match ended";
}

function capitalize(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

export function endReasonLabel(reason: string | null | undefined): string {
  if (!reason || reason === "unknown") return "Match ended";
  return LABELS[reason] ?? humanize(reason);
}

export type MatchResultSummary = {
  outcome: "win" | "loss" | "neutral";
  /** "You won" / "You lost" / "Seat 0 wins" */
  headline: string;
  /** Why it ended, e.g. "Your opponent's Leader took damage with 0 Life". */
  detail: string;
  /** Single line: "You won — Your opponent's Leader took damage with 0 Life". */
  text: string;
};

/**
 * Winner-perspective summary for the end screen. `youSeat` null (spectator) or
 * `neutral` (hotseat: one device, both seats) names seats instead of "You".
 */
export function describeMatchResult(opts: {
  winner: number | null | undefined;
  reason: string | null | undefined;
  youSeat: number | null;
  neutral?: boolean;
}): MatchResultSummary {
  const winner = opts.winner === 0 || opts.winner === 1 ? opts.winner : null;
  const loser = winner == null ? null : 1 - winner;
  const personal = !opts.neutral && (opts.youSeat === 0 || opts.youSeat === 1) && winner != null;
  const youWon = personal && winner === opts.youSeat;
  const winnerWho = personal ? (youWon ? YOU : OPP) : seatWho(winner);
  const loserWho = personal ? (youWon ? OPP : YOU) : seatWho(loser);

  const outcome: MatchResultSummary["outcome"] = personal ? (youWon ? "win" : "loss") : "neutral";
  const headline = personal
    ? youWon
      ? "You won"
      : "You lost"
    : winner != null
      ? `${winnerWho.subj} wins`
      : "Match over";

  const reason = opts.reason && opts.reason !== "unknown" ? opts.reason : null;
  const sentence = reason ? SENTENCES[reason] : undefined;
  const detail = sentence
    ? capitalize(sentence(loserWho, winnerWho))
    : reason
      ? endReasonLabel(reason)
      : "The match has ended";

  return { outcome, headline, detail, text: `${headline} — ${detail}` };
}
