import { Link } from "react-router-dom";
import { NavMenu } from "../nav/NavMenu";
import { BackLink } from "../pages/BackLink";
import { formatPercent } from "../decks/meta";
import { leaderPath } from "../leaders/slug";
import type { MetaSnapshot } from "../leaders/snapshot";
import "../pages/playOnline.css";

/**
 * Text for the crawlable HTML of `/` and `/leaderboard` (#914). The live pages are the lobby and the
 * ranked ladder, which only make sense with a session and a connection, so the pre-rendered copy is
 * a short public page with the same address, and the app replaces it as soon as it starts.
 */
export function HomeShell({ snapshot }: { snapshot: MetaSnapshot }) {
  const top = snapshot.leaders.slice(0, 8);
  return (
    <div className="app-shell">
      <div className="page play-online">
        <section className="play-online-hero">
          <h1 className="page-title play-online-title">OPTCG Duel: play the One Piece TCG online, free</h1>
          <p className="play-online-notice" role="note">
            <b>Unofficial fan-made One Piece TCG simulator.</b> Not affiliated with or endorsed by Bandai.
          </p>
          <p className="play-online-lede">
            Play OPTCG in your browser with ranked matches, bots, friends and your own decks. No download, and the rules engine runs the game for
            you.
          </p>
          <div className="play-online-cta">
            <Link to="/play-one-piece-tcg-online" className="btn btn-primary btn-lg">
              How to play online
            </Link>
            <Link to="/decks/meta" className="btn btn-secondary btn-lg">
              Browse meta decks
            </Link>
            <Link to="/leaders" className="btn btn-secondary btn-lg">
              Top leaders
            </Link>
          </div>
        </section>
        {top.length > 0 ? (
          <section className="panel" aria-labelledby="home-leaders">
            <h2 className="panel-title" id="home-leaders">
              Popular leaders right now
            </h2>
            <ul className="leader-links">
              {top.map((l) => (
                <li key={l.leader_id}>
                  <Link to={leaderPath(l)}>
                    {l.name || l.leader_id} ({l.leader_id}) · {formatPercent(l.share)}
                  </Link>
                </li>
              ))}
              <li>
                <Link to="/leaders">All leaders</Link>
              </li>
              <li>
                <Link to="/leaderboard">Ranked leaderboard</Link>
              </li>
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}

export function LeaderboardShell() {
  return (
    <div className="app-shell">
      <div className="page page-narrow">
        <header className="page-header">
          <NavMenu />
          <BackLink to="/" label="Home" ariaLabel="Back to home" />
          <h1 className="page-title">Leaderboard</h1>
        </header>
        <section className="leaderboard" aria-label="Leaderboard">
          <p className="panel-copy leaderboard-note">
            The top players on the OPTCG Duel ranked ladder and their Bounties. Win ranked matches to raise your Bounty and climb. Playing is free, with no download.
          </p>
          <p className="panel-copy leaderboard-note">
            <Link to="/play-one-piece-tcg-online">How to play OPTCG online</Link> · <Link to="/leaders">Top leaders</Link>
          </p>
        </section>
      </div>
    </div>
  );
}
