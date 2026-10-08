import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BountyAmount } from "../Bounty";
import { lookupCard } from "../cards/atlas";
import { fetchMatchHistory, type MatchHistoryEntry } from "../history/historyApi";
import { matchRow, outcomeKey } from "../history/matchRow";
import type { RatingMe } from "../net/api";
import { recordLabel, streak, streakLabel } from "./voyage";

const HISTORY_LIMIT = 10;
const SHOWN_GAMES = 3;

const CHIP: Record<ReturnType<typeof outcomeKey>, string> = { won: "W", lost: "L", unfinished: "Cut off" };

/**
 * Your Bounty, record, streak and last games (Google sign-in only). `me` is
 * undefined while loading and null when the rating call failed.
 */
export function VoyageCard({ me }: { me: RatingMe | null | undefined }) {
  const [games, setGames] = useState<MatchHistoryEntry[] | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    fetchMatchHistory(HISTORY_LIMIT)
      .then((g) => live && setGames(g))
      .catch(() => live && setGames(null));
    return () => {
      live = false;
    };
  }, []);

  const rows = games ? games.slice(0, SHOWN_GAMES).map((m) => matchRow(m, (id) => lookupCard(id).name)) : [];
  const failed = games === null || me === null;

  return (
    <section className="voyage" aria-label="Your voyage">
      <div className="friends-head">
        <h2 className="friends-title">Your voyage</h2>
        <Link to="/history" className="btn btn-ghost btn-sm">
          History
        </Link>
      </div>
      <div className="voyage-card">
        <div className="voyage-stats">
          <div className="voyage-stat">
            <b>{me ? <BountyAmount amount={me.rating} /> : "—"}</b>
            <span>Bounty</span>
          </div>
          <div className="voyage-stat">
            <b>{me ? recordLabel(me.wins, me.losses) : "—"}</b>
            <span>Record</span>
          </div>
          <div className="voyage-stat">
            <b>{games ? streakLabel(streak(games)) : "—"}</b>
            <span>Streak</span>
          </div>
        </div>
        <div className="voyage-games" aria-busy={games === undefined}>
          {failed ? (
            <p className="friends-empty">Couldn’t load your games right now.</p>
          ) : games === undefined ? null : rows.length === 0 ? (
            <p className="friends-empty">No games yet. Play Ranked to earn a Bounty.</p>
          ) : (
            <ul className="voyage-list">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link to={`/history/${r.id}`} className="voyage-row" data-outcome={outcomeKey(r.outcome)}>
                    <span className="voyage-chip">{CHIP[outcomeKey(r.outcome)]}</span>
                    <span className="voyage-vs">
                      <span className="voyage-opp">vs {r.opponent}</span>
                      <span className="voyage-leader">{r.opponentLeader}</span>
                    </span>
                    <span className={`voyage-delta${r.bountyDelta == null ? " voyage-delta-none" : ""}`}>{r.bountyDelta ?? "Unranked"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
