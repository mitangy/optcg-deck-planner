import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Select } from "@optcg/ui/popups";
import { readStored, writeStored } from "@optcg/ui/storage";
import { type AdminUser, type AdminUsers, fetchAdminUsers } from "./adminApi";
import { GAME_MODES, type UserSort, type UserSortKey, dateOf, firstSortDir, formatCount, formatSignupSource, nextUserSort, parseUserSort } from "./adminLogic";
import { type Actor, RoleControl, UserButtons, useUserActions, userLabel } from "./UserActions";

const PAGE = 50;
const SORT_KEY = "optcg-duel:admin-users-sort";

const COLUMNS: readonly { key: UserSortKey; label: string; short: string; title?: string; num?: boolean }[] = [
  { key: "user", label: "User", short: "User" },
  { key: "role", label: "Role", short: "Role" },
  { key: "source", label: "Source", short: "Source" },
  ...GAME_MODES.map((m) => ({ key: m.mode, label: m.label, short: m.short, title: m.title, num: true })),
  { key: "joined", label: "Joined", short: "Joined" },
];

function SortCaret({ dir }: { dir: "asc" | "desc" | null }) {
  return (
    <svg width="6" height="9" viewBox="0 0 7 10" focusable="false" aria-hidden="true">
      <path d="M3.5 0 7 4H0z" opacity={dir === "desc" ? 0.25 : 1} />
      <path d="M3.5 10 0 6h7z" opacity={dir === "asc" ? 0.25 : 1} />
    </svg>
  );
}

export type { Actor };

export function UsersTab({ actor }: { actor: Actor }) {
  const [q, setQ] = useState("");
  const [guests, setGuests] = useState(false);
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ready"; total: number; users: AdminUser[] }>({ status: "loading" });
  const [more, setMore] = useState(false);
  const [sort, setSort] = useState<UserSort | null>(() => parseUserSort(readStored(SORT_KEY)));
  const seq = useRef(0);

  const applySort = (next: UserSort) => {
    setSort(next);
    writeStored(SORT_KEY, JSON.stringify(next));
  };

  const load = useCallback((query: string, includeGuests: boolean, order: UserSort | null) => {
    const mine = ++seq.current;
    setMore(false);
    fetchAdminUsers(query, includeGuests, PAGE, 0, order)
      .then((r: AdminUsers) => mine === seq.current && setState({ status: "ready", total: r.total, users: r.users }))
      .catch((e: Error) => mine === seq.current && setState({ status: "error", message: e.message }));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(q, guests, sort), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q, guests, sort, load]);

  const loadMore = () => {
    if (state.status !== "ready") return;
    // A page that lands after the list was re-sorted, re-searched or reloaded belongs to the old list: drop it.
    const mine = seq.current;
    setMore(true);
    fetchAdminUsers(q, guests, PAGE, state.users.length, sort)
      .then((r) => mine === seq.current && setState((s) => (s.status === "ready" ? { status: "ready", total: r.total, users: [...s.users, ...r.users] } : s)))
      .catch((e: Error) => mine === seq.current && setNotice(e.message))
      .finally(() => mine === seq.current && setMore(false));
  };

  const actions = useUserActions((u, next) =>
    setState((s) => {
      if (s.status !== "ready") return s;
      if (!next) return { ...s, total: s.total - 1, users: s.users.filter((x) => x.id !== u.id) };
      return { ...s, users: s.users.map((x) => (x.id === u.id ? { ...x, ...next } : x)) };
    }),
  );
  const { notice, setNotice, busyId } = actions;

  const clearSort = () => {
    setSort(null);
    writeStored(SORT_KEY, "");
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
        <div className="adm-sortby">
          <span className="adm-sortby-label">Sort by</span>
          <Select<string>
            aria-label="Sort users by"
            className="adm-sortby-select"
            value={sort?.key ?? "default"}
            onChange={(key) => (key === "default" ? clearSort() : applySort({ key: key as UserSortKey, dir: firstSortDir(key as UserSortKey) }))}
            options={[{ value: "default", label: "Default" }, ...COLUMNS.map((c) => ({ value: c.key, label: c.label }))]}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm adm-sortdir"
            disabled={!sort}
            aria-label={sort ? `Sorted ${sort.dir === "asc" ? "ascending" : "descending"}, switch to ${sort.dir === "asc" ? "descending" : "ascending"}` : "Sort direction"}
            onClick={() => sort && applySort(nextUserSort(sort, sort.key))}
          >
            <SortCaret dir={sort?.dir ?? null} />
            <span>{sort?.dir === "desc" ? "Desc" : "Asc"}</span>
          </button>
        </div>
        <span className="adm-count" aria-live="polite">
          {state.status === "ready" ? `${formatCount(state.total)} ${state.total === 1 ? "user" : "users"}` : " "}
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
        <div className="adm-utable" role="table" aria-label="Users" aria-rowcount={users.length + 1}>
        <div className="adm-urow adm-uhead" role="row">
          {COLUMNS.map((c) => {
            const active = sort?.key === c.key ? sort.dir : null;
            return (
              <div key={c.key} role="columnheader" className={c.num ? "num" : undefined} title={c.title} aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : "none"}>
                <button type="button" className="adm-usort" aria-label={`Sort by ${c.label}`} data-sort={c.key} data-active={active ?? undefined} onClick={() => applySort(nextUserSort(sort, c.key))}>
                  <span className="adm-usort-label">{c.short}</span>
                  <span className={`adm-usort-arrow${active ? " active" : ""}`} aria-hidden="true">
                    <SortCaret dir={active} />
                  </span>
                </button>
              </div>
            );
          })}
          <div role="columnheader">Actions</div>
        </div>
        {users.map((u) => {
          const banned = u.banned_at != null;
          const busy = busyId === u.id;
          const source = formatSignupSource(u.signup_source);
          return (
            <div key={u.id} role="row" className={`adm-urow${banned ? " banned" : ""}`}>
              <span role="cell" className="adm-ucell adm-uname">
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
              <span role="cell" className="adm-ucell adm-urole">
                <RoleControl actor={actor} user={u} busy={busy} actions={actions} />
              </span>
              <span role="cell" className={`adm-ucell adm-usource${u.signup_source ? "" : " adm-muted"}`} data-label="Source" title={source.title}>
                {source.text}
              </span>
              {GAME_MODES.map((m) => (
                <span key={m.mode} role="cell" className="adm-ucell num adm-ugames" data-label={m.label} data-mode={m.mode} title={`${m.title}: ${u.games?.[m.mode] ?? 0}`}>
                  {u.games?.[m.mode] ?? 0}
                </span>
              ))}
              <span role="cell" className="adm-ucell adm-ujoined" data-label="Joined">
                {dateOf(u.created_at)}
              </span>
              <span role="cell" className="adm-ucell adm-uact">
                <UserButtons actor={actor} user={u} busy={busy} actions={actions} />
              </span>
            </div>
          );
        })}
        </div>
        {state.status === "loading" ? <p className="panel-copy adm-muted adm-urows-note">Loading users…</p> : null}
        {state.status === "ready" && users.length === 0 ? <p className="panel-copy adm-muted adm-urows-note">No users match.</p> : null}
      </div>
      {state.status === "ready" && users.length < state.total ? (
        <button type="button" className="btn btn-secondary btn-sm adm-more" onClick={loadMore} disabled={more}>
          Show more
        </button>
      ) : null}
    </section>
  );
}
