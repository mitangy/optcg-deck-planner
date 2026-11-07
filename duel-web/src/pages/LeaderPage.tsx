import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { usePageMeta } from "@optcg/ui/seo";
import { cardImageUrl } from "@optcg/ui/cardArt";
import { formatDeckRow, formatPercent, playMetaDeck, type MetaDeck, type MetaLeader } from "../decks/meta";
import { dataTail, leaderIntro, colorList } from "../leaders/leaderIntro";
import { leaderPath, parseLeaderSlug, resolveLeaderRoute } from "../leaders/slug";
import { useMetaView } from "../leaders/useMetaView";
import { NavMenu } from "../nav/NavMenu";
import { SITE_ORIGIN } from "../seo/routeMetaTable";
import { BackLink } from "./BackLink";
import { DeckCards, LeaderArt } from "./MetaDecksPage";
import "./playOnline.css";
import "./leaders.css";

/** What the leader page says about itself in the title, description and H1 (shared with the pre-render). */
export function leaderPageText(leader: MetaLeader, days: number) {
  const name = leader.name || leader.leader_id;
  return {
    h1: `${name} (${leader.leader_id}) deck list – play online free`,
    title: `${name} (${leader.leader_id}) deck list and meta stats – OPTCG Duel`,
    description:
      `${name} (${leader.leader_id}) in the One Piece TCG: ${formatPercent(leader.share)} of tournament decks in the last ${days} days, ` +
      `${leader.top8} top-8 finishes, ${formatPercent(leader.win_rate)} win rate. See recent top decklists and play the deck free in this unofficial simulator.`,
  };
}

export function ColorChips({ color }: { color: string }) {
  const colors = colorList(color);
  if (colors.length === 0) return null;
  return (
    <ul className="leader-colors" aria-label="Colours">
      {colors.map((c) => (
        <li key={c} className={`leader-color leader-color-${c}`}>
          {c}
        </li>
      ))}
    </ul>
  );
}

function PlayButton({ leader, deck, className, children }: { leader: MetaLeader; deck: MetaDeck; className: string; children: string }) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  function play() {
    setError(null);
    const result = playMetaDeck({ leaderId: leader.leader_id, name: leader.name }, deck);
    if (!result.ok) {
      setError(result.errors.join(" · ") || "Could not add this deck");
      return;
    }
    navigate("/");
  }
  return (
    <>
      <button type="button" className={className} onClick={play}>
        {children}
      </button>
      {error ? <span className="error-text leader-play-error" role="alert">{error}</span> : null}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="leader-stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function NotFound({ text }: { text: string }) {
  usePageMeta({ title: "Leader not found – OPTCG Duel", description: text, origin: SITE_ORIGIN, noindex: true });
  return (
    <div className="app-shell">
      <div className="page leader-page">
        <header className="page-header">
          <NavMenu />
          <BackLink to="/leaders" label="Leaders" ariaLabel="Back to all leaders" />
        </header>
        <section className="panel">
          <h1 className="page-title">{text}</h1>
          <p className="panel-copy">
            Pick another leader from <Link to="/leaders">the list of popular leaders</Link>, or <Link to="/decks/meta">browse the meta decks</Link>.
          </p>
        </section>
      </div>
    </div>
  );
}

/** `/leaders/:slug`: one popular leader with its numbers, recent top lists and a button to play one online (#914). */
export function LeaderPage() {
  const { slug = "" } = useParams();
  const view = useMetaView(parseLeaderSlug(slug)?.leaderId ?? null);
  const route = resolveLeaderRoute(slug, view.routeLeaders);

  if (route.kind === "redirect") return <Navigate to={route.to} replace />;
  if (route.kind === "unknown") {
    return view.settled ? <NotFound text="We have no recent tournament data for this leader" /> : <div className="app-shell" aria-busy="true" />;
  }
  return <LeaderBody leader={route.leader} view={view} />;
}

function LeaderBody({ leader, view }: { leader: MetaLeader; view: ReturnType<typeof useMetaView> }) {
  const decks = view.decks ?? [];
  const text = leaderPageText(leader, view.days);
  // A snapshot leader the live list dropped sits after the live ones, so it never reads as "most played" (#919).
  const rank = view.routeLeaders.findIndex((l) => l.leader_id === leader.leader_id) + 1;
  usePageMeta({
    title: text.title,
    description: text.description,
    path: leaderPath(leader),
    origin: SITE_ORIGIN,
    image: cardImageUrl(leader.image_url, "large") || undefined,
  });
  const others = view.leaders.filter((l) => l.leader_id !== leader.leader_id).slice(0, 6);
  const top = decks[0];
  return (
    <div className="app-shell">
      <div className="page leader-page">
        <header className="page-header">
          <NavMenu />
          <BackLink to="/leaders" label="Leaders" ariaLabel="Back to all leaders" />
        </header>

        <section className="leader-hero">
          <LeaderArt id={leader.leader_id} url={leader.image_url} className="leader-hero-art" />
          <div className="leader-hero-body">
            <ColorChips color={leader.color} />
            <h1 className="page-title leader-title">{text.h1}</h1>
            <p className="play-online-notice" role="note">
              <b>Unofficial fan-made One Piece TCG simulator.</b> Not affiliated with or endorsed by Bandai.
            </p>
            <dl className="leader-stats">
              <Stat label="Meta share" value={formatPercent(leader.share)} />
              <Stat label="Top 8s" value={String(leader.top8)} />
              <Stat label="Win rate" value={formatPercent(leader.win_rate)} />
              <Stat label="Decks" value={String(leader.decks)} />
            </dl>
            <div className="play-online-cta leader-cta">
              {top ? (
                <PlayButton leader={leader} deck={top} className="btn btn-primary btn-lg">
                  Play this deck online
                </PlayButton>
              ) : null}
              <Link to="/decks/meta" className="btn btn-secondary btn-lg">
                All meta decks
              </Link>
            </div>
          </div>
        </section>

        <section className="panel" aria-labelledby="leader-about">
          <h2 className="panel-title" id="leader-about">
            {leader.name || leader.leader_id} in the meta
          </h2>
          <div className="leader-intro">
            {leaderIntro({ leader, rank: rank || 1, of: view.routeLeaders.length, days: view.days, decks }).map((p) => (
              <p key={p} className="panel-copy">
                {p}
              </p>
            ))}
          </div>
        </section>

        <section className="panel" aria-labelledby="leader-decks">
          <h2 className="panel-title" id="leader-decks">
            Recent top decklists
          </h2>
          {decks.length === 0 ? (
            <p className="panel-copy">Loading decklists…</p>
          ) : (
            <ul className="meta-deck-list">
              {decks.map((d, i) => (
                <li key={d.id} className="meta-deck">
                  <details open={i === 0} className="leader-deck">
                    <summary className="leader-deck-summary">{formatDeckRow(d)}</summary>
                    <div className="meta-deck-actions">
                      <PlayButton leader={leader} deck={d} className="btn btn-primary">
                        Play this deck online
                      </PlayButton>
                      <a className="btn btn-secondary" href={d.event_url} target="_blank" rel="noopener noreferrer">
                        View on Limitless
                      </a>
                    </div>
                    <DeckCards deck={d} />
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel" aria-labelledby="leader-more">
          <h2 className="panel-title" id="leader-more">
            More leaders
          </h2>
          <ul className="leader-links">
            {others.map((l) => (
              <li key={l.leader_id}>
                <Link to={leaderPath(l)}>
                  {l.name || l.leader_id} ({l.leader_id})
                </Link>
              </li>
            ))}
            <li>
              <Link to="/leaders">All leaders</Link>
            </li>
            <li>
              <Link to="/play-one-piece-tcg-online">How to play OPTCG online</Link>
            </li>
          </ul>
        </section>

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
