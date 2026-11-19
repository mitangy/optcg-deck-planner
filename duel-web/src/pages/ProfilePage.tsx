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
import { fetchRatingMe, googleLoginUrl } from "../net/api";
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
  const { profileCard } = useDuelSettings();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const leaders = useMemo(() => listAtlasLeaders(), []);
  const results = useMemo(() => {
    const pool = q ? listAtlasIds() : leaders;
    const hits = q ? pool.filter((id) => `${lookupCard(id).name}\n${id}`.toLowerCase().includes(q)) : pool;
    return hits.slice(0, MAX_RESULTS);
  }, [q, leaders]);

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
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!profileCard}
          onClick={() => updateSettings({ profileCard: "" })}
        >
          Remove picture
        </button>
      </div>
      <p className="field-hint" role="status">
        {profileCard ? `Using ${cardLabel(profileCard)}.` : "No picture set. Pick a card below."}
      </p>
      {results.length === 0 ? (
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
                onClick={() => updateSettings({ profileCard: id })}
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

export function ProfilePage() {
  const authUser = useAuthUser();
  const { profileCard } = useDuelSettings();
  const rating = useAsyncResource(() => fetchRatingMe(), [authUser?.id], authUser != null);
  const bounty = rating.status === "ready" && rating.data ? rating.data.rating : null;
  const name = authUser ? authUser.username || authUser.email : "Guest";

  return (
    <PageShell pageClass="page-narrow" back={{ to: "/", label: "Home", ariaLabel: "Back to home" }} title="Profile">
      <section className="panel profile-head">
        <ProfileAvatar cardId={profileCard} name={name} size={72} />
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
