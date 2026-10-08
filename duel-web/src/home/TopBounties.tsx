import { useEffect, useState } from "react";
import { BountyAmount } from "../Bounty";
import { fetchLeaderboard, type LeaderboardEntry, type RatingMe } from "../net/api";
import { pinnedYou } from "./bounties";

const TOP_N = 5;

/** The five highest Bounties, with your own rank pinned under them when you are further down. Hidden when empty or failed. */
export function TopBounties({ me }: { me: RatingMe | null | undefined }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    let live = true;
    fetchLeaderboard(TOP_N)
      .then((e) => live && setEntries(e))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  if (entries.length === 0) return null;
  const you = pinnedYou(me ?? null, TOP_N);

  return (
    <section className="bounties" aria-label="Top bounties">
      <div className="friends-head">
        <h2 className="friends-title">Top bounties</h2>
      </div>
      <ol className="bounty-list">
        {entries.slice(0, TOP_N).map((e, i) => (
          <li key={e.user_id} className={`bounty-row${me && e.user_id === me.user_id ? " me" : ""}`}>
            <span className="bounty-rank">{i + 1}</span>
            <span className="bounty-name">{e.username || e.name}</span>
            <BountyAmount amount={e.rating} />
          </li>
        ))}
        {you ? (
          <li className="bounty-row me pinned">
            <span className="bounty-rank">{you.rank}</span>
            <span className="bounty-name">You</span>
            <BountyAmount amount={you.rating} />
          </li>
        ) : null}
      </ol>
    </section>
  );
}
