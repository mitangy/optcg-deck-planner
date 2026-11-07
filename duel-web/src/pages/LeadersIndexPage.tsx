import { Link } from "react-router-dom";
import { usePageMeta } from "@optcg/ui/seo";
import { formatPercent } from "../decks/meta";
import { dataTail } from "../leaders/leaderIntro";
import { leaderPath } from "../leaders/slug";
import { useMetaView } from "../leaders/useMetaView";
import { NavMenu } from "../nav/NavMenu";
import { routeMetaFor, SITE_ORIGIN } from "../seo/routeMetaTable";
import { BackLink } from "./BackLink";
import { ColorChips } from "./LeaderPage";
import { LeaderArt } from "./MetaDecksPage";
import "./playOnline.css";
import "./leaders.css";

/** `/leaders`: every popular leader of the last 30 days, each linking to its own page (#914). */
export function LeadersIndexPage() {
  const view = useMetaView(null);
  const meta = routeMetaFor("/leaders");
  usePageMeta({ title: meta.title, description: meta.description, path: "/leaders", origin: SITE_ORIGIN });
  return (
    <div className="app-shell">
      <div className="page leaders-index">
        <header className="page-header">
          <NavMenu />
          <BackLink to="/" label="Home" ariaLabel="Back to home" />
        </header>

        <section className="play-online-hero">
          <h1 className="page-title play-online-title">One Piece TCG leaders: meta share, win rate and decklists</h1>
          <p className="play-online-notice" role="note">
            <b>Unofficial fan-made One Piece TCG simulator.</b> Not affiliated with or endorsed by Bandai.
          </p>
          <p className="play-online-lede">
            The leaders people are winning with right now
            {view.totalDecks != null && view.events != null
              ? `, from ${view.totalDecks.toLocaleString("en-US")} tournament decks in ${view.events} events`
              : ""}
            . Open a leader to see its recent top decklists, then play one online for free in OPTCG Duel.
          </p>
          <div className="play-online-cta">
            <Link to="/decks/meta" className="btn btn-secondary btn-lg">
              Browse meta decks
            </Link>
            <Link to="/play-one-piece-tcg-online" className="btn btn-secondary btn-lg">
              How to play online
            </Link>
          </div>
        </section>

        {view.leaders.length === 0 ? (
          <p className="meta">{view.settled ? "No tournament data is available right now." : "Loading the leaders…"}</p>
        ) : (
          <ol className="leaders-grid">
            {view.leaders.map((l, i) => (
              <li key={l.leader_id}>
                <Link to={leaderPath(l)} className="meta-leader leaders-card">
                  <span className="leaders-rank" aria-hidden>
                    {i + 1}
                  </span>
                  <LeaderArt id={l.leader_id} url={l.image_url} className="meta-leader-art" />
                  <span className="meta-leader-body">
                    <span className="meta-leader-name">{l.name || l.leader_id}</span>
                    <span className="meta-leader-id">{l.leader_id}</span>
                    <ColorChips color={l.color} />
                    <span className="meta-leader-stats">
                      <span><b>{formatPercent(l.share)}</b> share</span>
                      <span><b>{l.top8}</b> top 8</span>
                      <span><b>{formatPercent(l.win_rate)}</b> win</span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}

        <p className="meta leader-data">
          Data:{" "}
          <a className="linkish" href={view.sourceUrl} target="_blank" rel="noopener noreferrer">
            {view.source}
          </a>
          {dataTail(view.days, view.updatedAt)}
        </p>
      </div>
    </div>
  );
}
