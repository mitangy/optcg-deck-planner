import { PageShell } from "../layout/PageShell";
import { useEffect, useState } from "react";
import "./admin.css";
import { Link, useNavigate, useParams } from "react-router-dom";
import { lookupCard } from "../cards/atlas";
import { type AdminUser, type AdminUserDetail, type AdminUserMatch, fetchAdminUser } from "./adminApi";
import { GAME_MODES, dateOf, formatCount as n, formatSignupSource, modeLabel, percent, presenceText, resultOf, soloNote, stampOf, totalGames, usd } from "./adminLogic";
import { staffAgo } from "../lib/relativeTime";
import { Gate, useAdminWho } from "./AdminGate";
import { Tile } from "./charts";
import { type Actor, RoleControl, UserButtons, useUserActions, userLabel } from "./UserActions";

const leaderName = (id: string | null) => (id ? lookupCard(id).name : "Unknown leader");
const BACK = { to: "/admin", label: "Admin", ariaLabel: "Back to admin" };

function MatchRow({ m }: { m: AdminUserMatch }) {
  const result = resultOf(m);
  return (
    <li className="adm-um">
      <span className="adm-um-when" title={`${stampOf(m.created_at)} UTC`}>
        <b>{dateOf(m.created_at)}</b>
        <small>{modeLabel(m.mode)}</small>
      </span>
      <span className="adm-um-leaders">
        <b>{leaderName(m.leader_id)}</b>
        <small>vs {leaderName(m.opponent_leader_id)}</small>
      </span>
      <span className="adm-um-opp">
        {m.opponent ? (
          <Link to={`/admin/users/${m.opponent.id}`} className="adm-ulink">
            {m.opponent.name}
          </Link>
        ) : (
          <span className="adm-muted">{m.mode === "bot" ? `Bot${m.bot_level ? ` (${m.bot_level})` : ""}` : "Same account"}</span>
        )}
      </span>
      <span className={`adm-um-result${result === "Won" ? " won" : result === "Lost" ? " lost" : ""}`}>{result}</span>
      <span className="adm-um-turns">{m.turns == null ? "—" : `${m.turns} turns`}</span>
      <span className="adm-um-replay">
        {m.replay ? (
          <Link className="adm-match-link" to={`/replay/${encodeURIComponent(m.id)}`}>
            Replay
          </Link>
        ) : null}
      </span>
    </li>
  );
}

function Header({ d, actor, onUser, onGone }: { d: AdminUserDetail; actor: Actor; onUser: (u: AdminUser) => void; onGone: () => void }) {
  const u = d.user;
  const actions = useUserActions((_, next) => (next ? onUser(next) : onGone()));
  const source = formatSignupSource(u.signup_source);
  const presence = presenceText(d.online);
  return (
    <section className="panel adm-uhero" aria-label="Account">
      <div className="adm-uhero-top">
        <div className="adm-uhero-name">
          <span className="adm-uhero-email">{u.email}</span>
          <span className="adm-muted">User #{u.id}</span>
        </div>
        <div className="adm-uhero-pills">
          <span className={`adm-pill adm-pill-${u.role === "user" ? "mid" : "ok"}`}>{u.role}</span>
          {u.banned_at ? <span className="adm-pill adm-pill-bad">Banned</span> : null}
          {presence ? <span className="adm-pill adm-pill-ok">{presence}</span> : null}
        </div>
      </div>
      {u.banned_at ? (
        <p className="adm-banned">
          Banned {dateOf(u.banned_at)}: {u.ban_reason || "no reason given"}
          {d.moderation.banned_by ? (
            <>
              {" "}
              by <Link to={`/admin/users/${d.moderation.banned_by.id}`} className="adm-ulink">{d.moderation.banned_by.name}</Link>
            </>
          ) : null}
        </p>
      ) : null}
      <div className="adm-tiles">
        <Tile label="Joined" value={dateOf(u.created_at)} sub={<span title={source.title}>{source.text}</span>} />
        <Tile
          label="Last seen"
          value={d.last_seen_at ? staffAgo(d.last_seen_at) : "Never"}
          sub={d.last_seen_at ? `${stampOf(d.last_seen_at)} UTC` : "No activity recorded"}
        />
        <Tile label="Games played" value={n(totalGames(u.games))} sub="All modes" />
        <Tile label="Rating" value={d.rating ? n(d.rating.rating) : "—"} sub={d.rating ? `${n(d.rating.ranked_games)} ranked games` : "Not rated yet"} />
      </div>
      <div className="adm-uhero-actions">
          <span className="adm-urole">
            <RoleControl actor={actor} user={u} busy={actions.busyId === u.id} actions={actions} />
          </span>
          <span className="adm-uact">
            <UserButtons actor={actor} user={u} busy={actions.busyId === u.id} actions={actions} />
          </span>
      </div>
      {actions.notice ? (
        <p className="adm-error" role="alert">
          {actions.notice}
        </p>
      ) : null}
    </section>
  );
}

function Detail({ d, actor, onUser }: { d: AdminUserDetail; actor: Actor; onUser: (u: AdminUser) => void }) {
  const navigate = useNavigate();
  const lp = d.log_pose;
  const m = d.moderation;
  return (
    <>
      <Header d={d} actor={actor} onUser={onUser} onGone={() => navigate("/admin")} />

      <section className="panel" aria-label="Games by mode">
        <h2 className="panel-title">Games by mode</h2>
        <div className="adm-table-wrap">
          <table className="adm-table adm-modes">
            <thead>
              <tr>
                <th scope="col">Mode</th>
                <th scope="col" className="num">Games</th>
                <th scope="col" className="num">Wins</th>
                <th scope="col" className="num">Win %</th>
              </tr>
            </thead>
            <tbody>
              {GAME_MODES.map((g) => {
                const row = d.modes.find((x) => x.mode === g.mode);
                return (
                  <tr key={g.mode}>
                    <td title={g.title}>{g.label}</td>
                    <td className="num">{n(row?.games ?? 0)}</td>
                    <td className="num">{n(row?.wins ?? 0)}</td>
                    <td className="num">{g.mode === "practice" ? "—" : percent(row?.wins ?? 0, row?.games ?? 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="adm-note">{soloNote(d.solo_tracked_since)}</p>
      </section>

      <section className="panel" aria-label="Top leaders">
        <h2 className="panel-title">Top leaders</h2>
        {d.top_leaders.length === 0 ? (
          <p className="panel-copy adm-muted">No games with a known leader yet.</p>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table adm-modes">
              <thead>
                <tr>
                  <th scope="col">Leader</th>
                  <th scope="col" className="num">Games</th>
                  <th scope="col" className="num">Wins</th>
                  <th scope="col" className="num">Win %</th>
                </tr>
              </thead>
              <tbody>
                {d.top_leaders.map((l) => (
                  <tr key={l.leader_id}>
                    <td title={l.leader_id}>
                      {leaderName(l.leader_id)} <small className="adm-muted">{l.leader_id}</small>
                    </td>
                    <td className="num">{n(l.games)}</td>
                    <td className="num">{n(l.wins)}</td>
                    <td className="num">{percent(l.wins, l.games)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel" aria-label="Recent matches">
        <h2 className="panel-title">Recent matches</h2>
        {d.recent_matches.length === 0 ? (
          <p className="panel-copy adm-muted">No games yet.</p>
        ) : (
          <ul className="adm-ums">
            {d.recent_matches.map((x) => (
              <MatchRow key={`${x.mode}-${x.id}`} m={x} />
            ))}
          </ul>
        )}
      </section>

      <div className="adm-grid2">
        <section className="panel" aria-label="Planner">
          <h2 className="panel-title">Planner</h2>
          <div className="adm-tiles adm-tiles-inner">
            <Tile label="Decks" value={n(d.planner.decks)} />
            <Tile label="Owned cards" value={n(d.planner.owned_cards)} sub={`${n(d.planner.owned_unique)} unique`} />
          </div>
        </section>

        <section className="panel" aria-label="Duel">
          <h2 className="panel-title">Duel</h2>
          <div className="adm-tiles adm-tiles-inner">
            <Tile label="Saved decks" value={n(d.duel.saved_decks)} />
            <Tile label="Uploads" value={n(d.duel.uploads)} sub={`${n(d.duel.uploads_taken_down)} taken down`} />
            <Tile label="Friends" value={n(d.duel.friends)} />
            <Tile label="Pending requests" value={n(d.duel.friend_requests_pending)} />
          </div>
        </section>

        <section className="panel" aria-label="Log Pose">
          <h2 className="panel-title">Log Pose</h2>
          <div className="adm-tiles adm-tiles-inner">
            <Tile label="Access" value={lp.access ?? "none"} />
            <Tile label="Questions" value={n(lp.questions_month)} sub={`this month, ${n(lp.questions_total)} total`} />
            <Tile label="Spend" value={usd(lp.spend_month_usd)} sub={`this month, ${usd(lp.spend_total_usd)} total`} />
            <Tile label="Threads" value={n(lp.threads)} sub={lp.last_used_at ? `Last used ${staffAgo(lp.last_used_at)}` : "Never used"} />
          </div>
        </section>

        <section className="panel" aria-label="Moderation">
          <h2 className="panel-title">Moderation</h2>
          <div className="adm-tiles adm-tiles-inner">
            <Tile label="Reports against" value={n(m.reports_against)} sub={`${n(m.reports_open)} open`} />
            <Tile label="Reports filed" value={n(m.reports_filed)} />
            <Tile label="Warnings" value={n(m.warnings)} />
            <Tile
              label="Banned by"
              value={m.banned_by ? <Link to={`/admin/users/${m.banned_by.id}`} className="adm-ulink">{m.banned_by.name}</Link> : "—"}
            />
          </div>
        </section>
      </div>
    </>
  );
}

export default function UserPage() {
  const who = useAdminWho();
  const id = Number(useParams().id);
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: AdminUserDetail }>({ status: "loading" });

  useEffect(() => {
    if (who.status !== "ok" || !Number.isInteger(id)) return;
    let live = true;
    setState({ status: "loading" });
    fetchAdminUser(id)
      .then((data) => live && setState({ status: "ready", data }))
      .catch((e: Error) => live && setState({ status: "error", message: e.message }));
    return () => {
      live = false;
    };
  }, [who.status, id]);

  if (who.status === "loading") {
    return (
      <Gate title="User" back={BACK}>
        <p className="panel-copy" role="status">Loading…</p>
      </Gate>
    );
  }
  if (who.status === "none") {
    return (
      <Gate title="Not available">
        <section className="panel">
          <p className="panel-copy">This page is only for staff accounts.</p>
        </section>
      </Gate>
    );
  }
  if (!Number.isInteger(id) || state.status === "error") {
    return (
      <Gate title="User" back={BACK}>
        <p className="panel-copy adm-error" role="alert">
          {Number.isInteger(id) && state.status === "error" ? `Could not load this user: ${state.message}` : "Unknown user."}
        </p>
      </Gate>
    );
  }
  if (state.status === "loading") {
    return (
      <Gate title="User" back={BACK}>
        <p className="panel-copy adm-muted" role="status">Loading…</p>
      </Gate>
    );
  }
  const d = state.data;
  return (
    <PageShell pageClass="adm-page adm-userpage" back={BACK} title={userLabel(d.user)} headerExtra={<span className="adm-role">{who.me.role}</span>}>
      <Detail d={d} actor={who.actor} onUser={(u) => setState({ status: "ready", data: { ...d, user: { ...d.user, ...u } } })} />
    </PageShell>
  );
}
