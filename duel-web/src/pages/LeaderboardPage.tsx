import { PageShell } from "../layout/PageShell";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAsyncResource } from "../lib/useAsyncResource";
import { BountyAmount } from "../Bounty";
import { pinnedYou } from "../home/bounties";
import { ensureAuth } from "../auth/session";
import { fetchFriends } from "../friends/friendsApi";
import { fetchLeaderboard, fetchRatingMe, googleLoginUrl, type LeaderboardEntry, type RatingMe } from "../net/api";
import { WINDOWS, filterEntries, movement, notListedText, provisionalDividerAt, type BoardWindow } from "./leaderboardModel";

const LIMIT = 100;
const PROVISIONAL_GAMES = 10;
const SKELETON_ROWS = 8;
const FLASH_MS = 1800;

type Auth = "checking" | "guest" | "user";

function PlayRanked() {
  return (
    <Link to="/?play=ranked" className="btn btn-primary btn-sm leaderboard-play">
      Play ranked
    </Link>
  );
}

function Gain({ amount }: { amount: number }) {
  const sign = amount > 0 ? "+" : amount < 0 ? "−" : "";
  return (
    <span className="leaderboard-gain">
      {sign}
      <BountyAmount amount={Math.abs(amount)} />
    </span>
  );
}

function Move({ change }: { change: number | null | undefined }) {
  const m = movement(change);
  if (!m) return null;
  return (
    <span className={`leaderboard-move ${m.kind}`}>
      <span aria-hidden>{m.label}</span>
      <span className="visually-hidden">{m.spoken}</span>
    </span>
  );
}

export function LeaderboardPage() {
  const [period, setPeriod] = useState<BoardWindow>("all");
  const res = useAsyncResource(() => fetchLeaderboard(LIMIT, period), [period]);
  const [auth, setAuth] = useState<Auth>("checking");
  const [me, setMe] = useState<RatingMe | null>(null);
  const [query, setQuery] = useState("");
  const [friendsOnly, setFriendsOnly] = useState(false);
  const [flash, setFlash] = useState<number | null>(null);
  const friendsRes = useAsyncResource(() => fetchFriends(), [], auth === "user" && friendsOnly);

  useEffect(() => {
    let live = true;
    ensureAuth()
      .then((u) => {
        if (!live) return null;
        setAuth(u ? "user" : "guest");
        return u ? fetchRatingMe() : null;
      })
      .then((r) => live && setMe(r))
      .catch(() => live && setAuth((a) => (a === "checking" ? "guest" : a)));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (flash == null) return;
    const t = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(t);
  }, [flash]);

  const loaded = res.status === "ready" ? res.data : null;
  const friendIds = useMemo(
    () => (friendsOnly && friendsRes.status === "ready" ? new Set(friendsRes.data.friends.map((f) => f.user_id)) : null),
    [friendsOnly, friendsRes],
  );
  const meId = me?.user_id ?? null;
  const rows = useMemo(
    () => filterEntries(loaded ?? [], query, friendsOnly ? (friendIds ?? new Set<number>()) : null, meId),
    [loaded, query, friendsOnly, friendIds, meId],
  );
  const filtering = query.trim() !== "" || friendsOnly;
  const mineRow = meId == null ? undefined : rows.find((e) => e.user_id === meId);
  const you = period === "all" && !filtering && loaded ? pinnedYou(me, loaded.map((e) => e.user_id)) : null;
  const dividerAt = period === "all" ? provisionalDividerAt(rows) : -1;
  const span = period === "week" ? "this week" : "this month";

  const showMe = useCallback(() => {
    if (meId == null) return;
    const el = document.getElementById(`lb-row-${meId}`);
    const calm = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
    el?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "center" });
    setFlash(meId);
  }, [meId]);

  const retry = res.reload;
  const timeless = period === "all";

  return (
    <PageShell pageClass="page-narrow" title="Leaderboard" headerExtra={<PlayRanked />}>
      <p className="leaderboard-sub">Win ranked games to raise your Bounty. Under {PROVISIONAL_GAMES} ranked games is provisional.</p>

      <YourBounty auth={auth} me={me} timeless={timeless} span={span} entries={loaded} canShow={mineRow != null} onShow={showMe} />

      <div className="leaderboard-toolbar">
        <div className="segmented segmented-3 leaderboard-window" role="radiogroup" aria-label="Time period">
          {WINDOWS.map((w) => (
            <button
              key={w.id}
              type="button"
              role="radio"
              aria-checked={period === w.id}
              className={period === w.id ? "active" : ""}
              onClick={() => setPeriod(w.id)}
            >
              {w.label}
            </button>
          ))}
        </div>
        <label className="leaderboard-search">
          <span className="visually-hidden">Find a player</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a player" autoComplete="off" />
        </label>
        {auth === "user" ? (
          <button
            type="button"
            className={`btn btn-secondary btn-sm leaderboard-friends${friendsOnly ? " active" : ""}`}
            aria-pressed={friendsOnly}
            onClick={() => setFriendsOnly((v) => !v)}
          >
            Friends
          </button>
        ) : null}
      </div>
      {friendsOnly && friendsRes.status === "error" ? (
        <p className="panel-copy leaderboard-note" role="alert">Could not load your friends.</p>
      ) : null}

      <section className="leaderboard" aria-label="Leaderboard" aria-busy={res.status === "loading"}>
        {loaded && loaded.length === 0 ? null : <div className="leaderboard-cols" aria-hidden>
          <span className="leaderboard-rank">#</span>
          <span className="bounty-name">Player</span>
          <span className="leaderboard-bounty">{timeless ? "Bounty" : "Gain"}</span>
          <span className="leaderboard-record">W-L</span>
        </div>}
        {res.status === "loading" ? (
          <ol className="bounty-list leaderboard-list" role="status" aria-label="Loading the leaderboard">
            {Array.from({ length: SKELETON_ROWS }, (_, i) => (
              <li key={i} className="bounty-row leaderboard-row skeleton" aria-hidden>
                <span className="skeleton-bar" />
              </li>
            ))}
          </ol>
        ) : null}
        {res.status === "error" ? (
          <div className="leaderboard-note" role="alert">
            <p className="panel-copy">Could not load the leaderboard.</p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={retry}>
              Try again
            </button>
          </div>
        ) : null}
        {loaded && loaded.length === 0 ? (
          <div className="leaderboard-note">
            <p className="panel-copy">{timeless ? "No ranked games yet." : `No ranked games ${span}.`} Be the first on the board.</p>
            <PlayRanked />
          </div>
        ) : null}
        {loaded && loaded.length > 0 && rows.length === 0 ? <p className="panel-copy leaderboard-note">No players match</p> : null}
        {rows.length > 0 ? (
          <ol className="bounty-list leaderboard-list">
            {rows.map((e, i) => (
              <Row key={e.user_id} e={e} timeless={timeless} mine={e.user_id === meId} flash={e.user_id === flash} divider={i === dividerAt} />
            ))}
            {you && me ? (
              <li className="bounty-row leaderboard-row me pinned">
                <span className="leaderboard-rank">
                  <span>{you.rank}</span>
                </span>
                <span className="bounty-name">You</span>
                <span className="leaderboard-bounty">
                  <BountyAmount amount={you.rating} />
                </span>
                <span className="leaderboard-record" title={`${me.games_played} games`}>
                  {me.wins}-{me.losses}
                </span>
              </li>
            ) : null}
          </ol>
        ) : null}
      </section>
    </PageShell>
  );
}

function Row({ e, timeless, mine, flash, divider }: { e: LeaderboardEntry; timeless: boolean; mine: boolean; flash: boolean; divider: boolean }) {
  const muted = e.provisional;
  return (
    <>
      {divider ? <li className="leaderboard-divider">Provisional (under {PROVISIONAL_GAMES} games)</li> : null}
      <li
        id={`lb-row-${e.user_id}`}
        className={`bounty-row leaderboard-row${mine ? " me" : ""}${muted ? " provisional" : ""}${flash ? " flash" : ""}`}
        aria-current={mine ? "true" : undefined}
      >
        <span className="leaderboard-rank">
          <span>{e.rank}</span>
          {timeless ? <Move change={e.rank_change} /> : null}
        </span>
        <span className="leaderboard-who">
          <span className="bounty-name">{e.username || e.name}</span>
          {mine || muted ? (
            <span className="leaderboard-tags">
              {mine ? <span className="leaderboard-you">You</span> : null}
              {muted ? <span className="leaderboard-prov">Provisional</span> : null}
            </span>
          ) : null}
        </span>
        <span className="leaderboard-bounty">
          {timeless ? <BountyAmount amount={e.rating} /> : <Gain amount={e.bounty_change ?? 0} />}
        </span>
        <span className="leaderboard-record" title={`${e.games_played} games`}>
          {e.wins}-{e.losses}
        </span>
      </li>
    </>
  );
}

function YourBounty({
  auth,
  me,
  timeless,
  span,
  entries,
  canShow,
  onShow,
}: {
  auth: Auth;
  me: RatingMe | null;
  timeless: boolean;
  span: string;
  entries: LeaderboardEntry[] | null;
  canShow: boolean;
  onShow: () => void;
}) {
  if (auth === "checking") return <div className="leaderboard-you-card placeholder" aria-hidden />;
  if (auth === "guest") {
    return (
      <div className="leaderboard-you-card">
        <p className="leaderboard-you-text">Sign in and play ranked to get a Bounty</p>
        <a className="btn btn-primary btn-sm" href={googleLoginUrl()}>
          Sign in with Google
        </a>
      </div>
    );
  }
  if (!me) return <div className="leaderboard-you-card placeholder" aria-hidden />;

  const entry = entries?.find((e) => e.user_id === me.user_id);
  let body;
  if (timeless) {
    if (me.rank == null) {
      body = <p className="leaderboard-you-text">No ranked games yet. Play one to get a Bounty.</p>;
    } else {
      const provisional = me.provisional ?? me.games_played < PROVISIONAL_GAMES;
      body = (
        <>
          <span className="leaderboard-you-rank">
            {provisional ? `Provisional · ${me.games_played} of ${PROVISIONAL_GAMES} games` : `Rank ${me.rank}`}
          </span>
          <BountyAmount amount={me.rating} />
          <span className="leaderboard-you-record">
            W-L {me.wins}-{me.losses}
          </span>
        </>
      );
    }
  } else if (entry) {
    body = (
      <>
        <span className="leaderboard-you-rank">Rank {entry.rank}</span>
        <Gain amount={entry.bounty_change ?? 0} />
        <span className="leaderboard-you-record">
          W-L {entry.wins}-{entry.losses}
        </span>
      </>
    );
  } else if (entries) {
    body = <p className="leaderboard-you-text">{notListedText(entries, LIMIT, span)}</p>;
  } else {
    body = <p className="leaderboard-you-text">&nbsp;</p>;
  }
  return (
    <div className="leaderboard-you-card" aria-label="Your bounty">
      <div className="leaderboard-you-body">{body}</div>
      {canShow ? (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onShow}>
          Show me
        </button>
      ) : null}
    </div>
  );
}
