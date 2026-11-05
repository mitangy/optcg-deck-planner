import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { type AdminUser, type AdminUsers, fetchAdminUsers } from "./adminApi";
import { GAME_MODES, dateOf, formatSignupSource } from "./adminLogic";
import { type Actor, RoleControl, UserButtons, useUserActions, userLabel } from "./UserActions";

const PAGE = 50;

export type { Actor };

export function UsersTab({ actor }: { actor: Actor }) {
  const [q, setQ] = useState("");
  const [guests, setGuests] = useState(false);
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ready"; total: number; users: AdminUser[] }>({ status: "loading" });
  const [more, setMore] = useState(false);
  const seq = useRef(0);

  const load = useCallback((query: string, includeGuests: boolean) => {
    const mine = ++seq.current;
    fetchAdminUsers(query, includeGuests, PAGE, 0)
      .then((r: AdminUsers) => mine === seq.current && setState({ status: "ready", total: r.total, users: r.users }))
      .catch((e: Error) => mine === seq.current && setState({ status: "error", message: e.message }));
  }, []);

  // Typing waits a beat so each keystroke is not a request.
  useEffect(() => {
    const t = setTimeout(() => load(q, guests), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q, guests, load]);

  const loadMore = () => {
    if (state.status !== "ready") return;
    setMore(true);
    fetchAdminUsers(q, guests, PAGE, state.users.length)
      .then((r) => setState((s) => (s.status === "ready" ? { status: "ready", total: r.total, users: [...s.users, ...r.users] } : s)))
      .catch((e: Error) => setNotice(e.message))
      .finally(() => setMore(false));
  };

  const actions = useUserActions((u, next) =>
    setState((s) => {
      if (s.status !== "ready") return s;
      if (!next) return { ...s, total: s.total - 1, users: s.users.filter((x) => x.id !== u.id) };
      return { ...s, users: s.users.map((x) => (x.id === u.id ? { ...x, ...next } : x)) };
    }),
  );
  const { notice, setNotice, busyId } = actions;

  const users = state.status === "ready" ? state.users : [];
  return (
    <section className="panel adm-users" aria-label="Users">
      <div className="adm-toolbar">
        <label className="adm-search">
          <span className="sr-only">Search users</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search email, name or username" autoComplete="off" />
        </label>
        <label className="adm-check">
          <input type="checkbox" checked={guests} onChange={(e) => setGuests(e.target.checked)} />
          Show guests
        </label>
        <span className="adm-count" aria-live="polite">
          {state.status === "ready" ? `${state.total.toLocaleString("en-US")} ${state.total === 1 ? "user" : "users"}` : " "}
        </span>
      </div>
      {notice ? (
        <p className="adm-error" role="alert">
          {notice}
        </p>
      ) : null}
      {state.status === "error" ? (
        <p className="adm-error" role="alert">
          Could not load users: {state.message}
        </p>
      ) : null}
      <div className="adm-urows" aria-busy={state.status === "loading"}>
        <div className="adm-urow adm-uhead" aria-hidden>
          <span>User</span>
          <span>Role</span>
          <span>Source</span>
          {GAME_MODES.map((m) => (
            <span key={m.mode} className="num" title={m.title}>
              {m.short}
            </span>
          ))}
          <span>Joined</span>
          <span>Actions</span>
        </div>
        {state.status === "loading" ? <p className="panel-copy adm-muted adm-urows-note">Loading users…</p> : null}
        {state.status === "ready" && users.length === 0 ? <p className="panel-copy adm-muted adm-urows-note">No users match.</p> : null}
        {users.map((u) => {
          const banned = u.banned_at != null;
          const busy = busyId === u.id;
          const source = formatSignupSource(u.signup_source);
          return (
            <div key={u.id} className={`adm-urow${banned ? " banned" : ""}`}>
              <span className="adm-ucell adm-uname">
                <b>
                  <Link to={`/admin/users/${u.id}`} className="adm-ulink" title="Open the user page">
                    {userLabel(u)}
                  </Link>
                </b>
                <small>{u.email}</small>
                {banned ? (
                  <small className="adm-banned">
                    <span className="adm-pill adm-pill-bad">Banned</span> {u.ban_reason || "no reason given"} · {dateOf(u.banned_at!)}
                  </small>
                ) : null}
              </span>
              <span className="adm-ucell adm-urole">
                <RoleControl actor={actor} user={u} busy={busy} actions={actions} />
              </span>
              <span className={`adm-ucell adm-usource${u.signup_source ? "" : " adm-muted"}`} data-label="Source" title={source.title}>
                {source.text}
              </span>
              {GAME_MODES.map((m) => (
                <span key={m.mode} className="adm-ucell num adm-ugames" data-label={m.label} data-mode={m.mode} title={`${m.title}: ${u.games?.[m.mode] ?? 0}`}>
                  {u.games?.[m.mode] ?? 0}
                </span>
              ))}
              <span className="adm-ucell adm-ujoined" data-label="Joined">
                {dateOf(u.created_at)}
              </span>
              <span className="adm-ucell adm-uact">
                <UserButtons actor={actor} user={u} busy={busy} actions={actions} />
              </span>
            </div>
          );
        })}
      </div>
      {state.status === "ready" && users.length < state.total ? (
        <button type="button" className="btn btn-secondary btn-sm adm-more" onClick={loadMore} disabled={more}>
          Show more
        </button>
      ) : null}
    </section>
  );
}
