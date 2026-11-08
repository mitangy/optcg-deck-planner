import { PageShell } from "../layout/PageShell";
import { useEffect, useMemo, useState } from "react";
import { useAsyncResource } from "../lib/useAsyncResource";
import { BountyAmount } from "../Bounty";
import { pinnedYou } from "../home/bounties";
import { ensureAuth } from "../auth/session";
import { fetchLeaderboard, fetchRatingMe, type LeaderboardEntry, type RatingMe } from "../net/api";

/** The backend caps the leaderboard at 100 players. */
const LIMIT = 100;

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; entries: LeaderboardEntry[] };

export function LeaderboardPage() {
  const res = useAsyncResource(() => fetchLeaderboard(LIMIT), []);
  const state = useMemo<State>(
    () => (res.status === "ready" ? { status: "ready", entries: res.data } : { status: res.status }),
    [res],
  );
  /** Your Bounty and rank; null when signed out, no ranked games yet, or the call failed. */
  const [me, setMe] = useState<RatingMe | null>(null);

  useEffect(() => {
    let live = true;
    ensureAuth()
      .then((u) => (u ? fetchRatingMe() : null))
      .then((r) => live && setMe(r))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const retry = res.reload;
  const entries = state.status === "ready" ? state.entries : [];
  const you = pinnedYou(me, entries.map((e) => e.user_id));

  return (
    <PageShell pageClass="page-narrow" back={{ to: "/", label: "Home", ariaLabel: "Back to home" }} title="Leaderboard">

      <section className="leaderboard" aria-label="Leaderboard">
        {state.status === "loading" ? <p className="panel-copy leaderboard-note" role="status">Loading the leaderboard…</p> : null}
        {state.status === "error" ? (
          <div className="leaderboard-note" role="alert">
            <p className="panel-copy">Could not load the leaderboard.</p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={retry}>
              Try again
            </button>
          </div>
        ) : null}
        {state.status === "ready" && entries.length === 0 ? (
          <p className="panel-copy leaderboard-note">No ranked games yet</p>
        ) : null}
        {entries.length > 0 ? (
          <>
            <div className="leaderboard-cols" aria-hidden>
              <span className="bounty-rank">#</span>
              <span className="bounty-name">Player</span>
              <span className="leaderboard-bounty">Bounty</span>
              <span className="leaderboard-games">Games</span>
            </div>
            <ol className="bounty-list leaderboard-list">
              {entries.map((e, i) => {
                const mine = me != null && e.user_id === me.user_id;
                return (
                  <li key={e.user_id} className={`bounty-row${mine ? " me" : ""}`} aria-current={mine ? "true" : undefined}>
                    <span className="bounty-rank">{i + 1}</span>
                    <span className="bounty-name">{e.username || e.name}</span>
                    {mine ? <span className="leaderboard-you">You</span> : null}
                    <span className="leaderboard-bounty">
                      <BountyAmount amount={e.rating} />
                    </span>
                    <span className="leaderboard-games">{e.games_played}</span>
                  </li>
                );
              })}
              {you && me ? (
                <li className="bounty-row me pinned">
                  <span className="bounty-rank">{you.rank}</span>
                  <span className="bounty-name">You</span>
                  <span className="leaderboard-bounty">
                    <BountyAmount amount={you.rating} />
                  </span>
                  <span className="leaderboard-games">{me.games_played}</span>
                </li>
              ) : null}
            </ol>
          </>
        ) : null}
      </section>
    </PageShell>
  );
}
