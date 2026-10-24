import { useCallback, useEffect, useRef, useState } from "react";
import { type AdminUser, type AdminUsers, type Role, banUser, deleteUser, fetchAdminUsers, setUserRole, unbanUser } from "./adminApi";
import { canBanUser, canDeleteUser, dateOf } from "./adminLogic";

const PAGE = 50;

export type Actor = { id: number; role: Role };

function label(u: AdminUser): string {
  return u.username || u.name || u.email;
}

export function UsersTab({ actor }: { actor: Actor }) {
  const [q, setQ] = useState("");
  const [guests, setGuests] = useState(false);
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ready"; total: number; users: AdminUser[] }>({ status: "loading" });
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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

  async function act(u: AdminUser, run: () => Promise<AdminUser | void>) {
    setBusyId(u.id);
    setNotice(null);
    try {
      const next = await run();
      setState((s) => {
        if (s.status !== "ready") return s;
        if (!next) return { ...s, total: s.total - 1, users: s.users.filter((x) => x.id !== u.id) };
        return { ...s, users: s.users.map((x) => (x.id === u.id ? { ...x, ...next } : x)) };
      });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusyId(null);
    }
  }

  const ban = (u: AdminUser) => {
    const reason = window.prompt(`Ban ${label(u)}? They are signed out everywhere and cannot sign in.\nReason (optional, shown to staff):`, "");
    if (reason === null) return;
    void act(u, () => banUser(u.id, reason));
  };
  const remove = (u: AdminUser) => {
    const word = u.username || u.email;
    const typed = window.prompt(`Delete ${word} and everything tied to the account. This cannot be undone.\nType ${word} to confirm:`, "");
    if (typed === null) return;
    if (typed.trim() !== word) {
      setNotice("Not deleted: what you typed did not match.");
      return;
    }
    void act(u, async () => {
      await deleteUser(u.id);
    });
  };

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
          <span className="num">Matches</span>
          <span>Joined</span>
          <span>Actions</span>
        </div>
        {state.status === "loading" ? <p className="panel-copy adm-muted adm-urows-note">Loading users…</p> : null}
        {state.status === "ready" && users.length === 0 ? <p className="panel-copy adm-muted adm-urows-note">No users match.</p> : null}
        {users.map((u) => {
          const banned = u.banned_at != null;
          const mayBan = canBanUser(actor, u);
          const mayDelete = canDeleteUser(actor, u);
          const busy = busyId === u.id;
          return (
            <div key={u.id} className={`adm-urow${banned ? " banned" : ""}`}>
              <span className="adm-ucell adm-uname">
                <b>{label(u)}</b>
                <small>{u.email}</small>
                {banned ? (
                  <small className="adm-banned">
                    <span className="adm-pill adm-pill-bad">Banned</span> {u.ban_reason || "no reason given"} · {dateOf(u.banned_at!)}
                  </small>
                ) : null}
              </span>
              <span className="adm-ucell adm-urole">
                {actor.role === "admin" ? (
                  <select
                    aria-label={`Role for ${label(u)}`}
                    value={u.role}
                    disabled={u.role === "admin" || u.id === actor.id || busy}
                    onChange={(e) => void act(u, () => setUserRole(u.id, e.target.value as "user" | "moderator"))}
                  >
                    {u.role === "admin" ? <option value="admin">admin</option> : null}
                    <option value="user">user</option>
                    <option value="moderator">moderator</option>
                  </select>
                ) : (
                  <span className={`adm-pill adm-pill-${u.role === "user" ? "mid" : "ok"}`}>{u.role}</span>
                )}
              </span>
              <span className="adm-ucell num" data-label="Matches">
                {u.matches}
              </span>
              <span className="adm-ucell" data-label="Joined">
                {dateOf(u.created_at)}
              </span>
              <span className="adm-ucell adm-uact">
                {banned ? (
                  <button type="button" className="btn btn-secondary btn-sm" disabled={!mayBan || busy} onClick={() => void act(u, () => unbanUser(u.id))}>
                    Unban
                  </button>
                ) : (
                  <button type="button" className="btn btn-secondary btn-sm" disabled={!mayBan || busy} onClick={() => ban(u)}>
                    Ban
                  </button>
                )}
                {actor.role === "admin" ? (
                  <button type="button" className="btn btn-secondary btn-sm adm-delete" disabled={!mayDelete || busy} onClick={() => remove(u)}>
                    Delete
                  </button>
                ) : null}
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
