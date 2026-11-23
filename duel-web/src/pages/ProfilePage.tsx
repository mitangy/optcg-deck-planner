import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { UsernameSettings } from "../auth/UsernameSettings";
import { useAuthUser } from "../auth/session";
import { BountyAmount } from "../Bounty";
import { listAtlasIds, listAtlasLeaders, lookupCard } from "../cards/atlas";
import { fetchMatchHistory } from "../history/historyApi";
import { MatchHistoryList, RecordSummary } from "../history/MatchHistoryList";
import { PageShell } from "../layout/PageShell";
import { useAsyncResource } from "../lib/useAsyncResource";
import { fetchMySeasons, fetchRatingMe, googleLoginUrl } from "../net/api";
import { ProfileAvatar } from "../profile/ProfileAvatar";
import { updateSettings, useDuelSettings } from "../settings";
import "../history/history.css";
import "../profile/profile.css";

const MAX_RESULTS = 48;
const HISTORY_ROWS = 5;

function cardLabel(id: string): string {
  const name = lookupCard(id).name;
  return name && name !== id ? `${name} (${id})` : id;
}

function PicturePanel({ name }: { name: string }) {
  const { profileCard, profileArt } = useDuelSettings();
  const [query, setQuery] = useState("");
  const [artOpen, setArtOpen] = useState(false);
  const q = query.trim().toLowerCase();
  const leaders = useMemo(() => listAtlasLeaders(), []);
  const results = useMemo(() => {
    const pool = q ? listAtlasIds() : leaders;
    const hits = q ? pool.filter((id) => `${lookupCard(id).name}\n${id}`.toLowerCase().includes(q)) : pool;
    return hits.slice(0, MAX_RESULTS);
  }, [q, leaders]);
  const alts = profileCard ? (lookupCard(profileCard).altArts ?? []) : [];
  const chosenAlt = alts.find((a) => a.id === profileArt);
  const choosingArt = artOpen && alts.length > 0;

  const pickCard = (id: string) => {
    updateSettings({ profileCard: id, profileArt: "" });
    setArtOpen((lookupCard(id).altArts?.length ?? 0) > 0);
  };
  const pickArt = (id: string) => updateSettings({ profileArt: id });
  const removePicture = () => {
    updateSettings({ profileCard: "", profileArt: "" });
    setArtOpen(false);
  };

  return (
    <section className="panel" aria-labelledby="profile-picture-title">
      <h2 className="panel-title" id="profile-picture-title">Profile picture</h2>
      <div className="profile-pick-bar">
        <div className="field">
          <label htmlFor="profile-card-search">Find a card by name or number</label>
          <input
            id="profile-card-search"
            type="search"
            value={query}
            placeholder="Leaders shown, type to search every card"
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button type="button" className="btn btn-secondary" disabled={!profileCard} onClick={removePicture}>
          Remove picture
        </button>
        {profileCard && alts.length > 0 && !choosingArt ? (
          <button type="button" className="btn btn-secondary" onClick={() => setArtOpen(true)}>
            Change art
          </button>
        ) : null}
      </div>
      <p className="field-hint" role="status">
        {profileCard
          ? `Using ${cardLabel(profileCard)}, ${chosenAlt ? chosenAlt.label : "base art"}.`
          : "No picture set. Pick a card below."}
      </p>
      {choosingArt ? (
        <>
          <div className="profile-art-head">
            <h3 className="profile-art-title">Choose art for {cardLabel(profileCard)}</h3>
            <button type="button" className="btn btn-secondary" onClick={() => setArtOpen(false)}>
              Back to cards
            </button>
          </div>
          <ul className="profile-pick-grid profile-art-grid">
            {[{ id: "", label: "Base" }, ...alts].map((art) => (
              <li key={art.id || "base"} className="profile-art-tile">
                <button
                  type="button"
                  className="profile-pick"
                  aria-pressed={art.id === (chosenAlt?.id ?? "")}
                  aria-label={art.label}
                  title={art.label}
                  onClick={() => pickArt(art.id)}
                >
                  <ProfileAvatar cardId={profileCard} artId={art.id} name={name} />
                </button>
                <span className="profile-art-caption" aria-hidden>{art.label}</span>
              </li>
            ))}
          </ul>
        </>
      ) : results.length === 0 ? (
        <p className="field-hint">No cards match “{query.trim()}”.</p>
      ) : (
        <ul className="profile-pick-grid">
          {results.map((id) => (
            <li key={id}>
              <button
                type="button"
                className="profile-pick"
                aria-pressed={id === profileCard}
                aria-label={cardLabel(id)}
                title={cardLabel(id)}
                onClick={() => pickCard(id)}
              >
                <ProfileAvatar cardId={id} name={name} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HistoryPanel() {
  const res = useAsyncResource(() => fetchMatchHistory(), []);
  return (
    <section className="panel" aria-labelledby="profile-history-title">
      <h2 className="panel-title" id="profile-history-title">Match history</h2>
      {res.status === "loading" ? <p className="panel-copy history-note">Loading your matches…</p> : null}
      {res.status === "error" ? <p className="panel-copy history-note" role="alert">Could not load your matches.</p> : null}
      {res.status === "ready" && res.data.length === 0 ? (
        <p className="panel-copy">No finished duels yet. Games against other signed-in players show up here.</p>
      ) : null}
      {res.status === "ready" && res.data.length > 0 ? (
        <>
          <RecordSummary matches={res.data} />
          <MatchHistoryList matches={res.data} limit={HISTORY_ROWS} />
          <div className="btn-row">
            <Link to="/history" className="btn btn-secondary">
              See all matches
            </Link>
          </div>
        </>
      ) : null}
    </section>
  );
}

function PastSeasonsPanel() {
  const res = useAsyncResource(() => fetchMySeasons(), []);
  if (res.status !== "ready" || res.data.length === 0) return null;
  return (
    <section className="panel" aria-labelledby="profile-seasons-title">
      <h2 className="panel-title" id="profile-seasons-title">Past seasons</h2>
      <ul className="profile-seasons">
        {res.data.map((s) => (
          <li key={s.number}>
            <Link to={`/leaderboard?season=${s.number}`} className="profile-season-name">
              {s.name}
            </Link>
            <span className="profile-season-rank" title={s.provisional ? "Provisional (under 10 games)" : undefined}>
              #{s.rank}
            </span>
            <BountyAmount amount={s.rating} />
            <span className="profile-season-record">
              {s.wins}-{s.losses}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ProfilePage() {
  const authUser = useAuthUser();
  const { profileCard, profileArt } = useDuelSettings();
  const rating = useAsyncResource(() => fetchRatingMe(), [authUser?.id], authUser != null);
  const bounty = rating.status === "ready" && rating.data ? rating.data.rating : null;
  const name = authUser ? authUser.username || authUser.email : "Guest";

  return (
    <PageShell pageClass="page-narrow" back={{ to: "/", label: "Home", ariaLabel: "Back to home" }} title="Profile">
      <section className="panel profile-head">
        <ProfileAvatar cardId={profileCard} artId={profileArt} name={name} size={72} />
        <div className="profile-head-text">
          <h2 className="profile-name">{name}</h2>
          {authUser?.username ? <p className="profile-email">{authUser.email}</p> : null}
          {!authUser ? <p className="profile-email">Playing as a guest</p> : null}
          {bounty != null ? <BountyAmount amount={bounty} /> : null}
        </div>
      </section>

      <PicturePanel name={name} />

      {authUser ? (
        <>
          <section className="panel" aria-labelledby="profile-username-title">
            <h2 className="panel-title" id="profile-username-title">Username</h2>
            <UsernameSettings user={authUser} />
          </section>
          <PastSeasonsPanel />
          <HistoryPanel />
        </>
      ) : (
        <section className="panel">
          <p className="panel-copy">
            Sign in to pick a username, keep your Bounty and see your match history. Your picture is saved on this device until then.
          </p>
          <div className="btn-row">
            <a className="btn btn-primary" href={googleLoginUrl()}>
              Sign in with Google
            </a>
          </div>
        </section>
      )}

      <p className="field-hint">
        <Link to="/settings">More settings</Link>
      </p>
    </PageShell>
  );
}
