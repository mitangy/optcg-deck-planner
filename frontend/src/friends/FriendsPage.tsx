import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { SharingCard } from "./SharingCard";
import { TradesPanel } from "./TradesPanel";
import { MySparesPanel } from "./MySparesPanel";
import { friendsApi } from "./friendsApi";
import { Empty, LoadError, Tabs } from "./ui";
import { USERNAME_MAX, usernameFormatError } from "./username";

type FriendsTab = "friends" | "trades" | "spares";
const TABS: FriendsTab[] = ["friends", "trades", "spares"];

const friendPath = (username: string) => `/friends/${encodeURIComponent(username)}`;

export function FriendsPage() {
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: FriendsTab = TABS.includes(raw as FriendsTab) ? (raw as FriendsTab) : "friends";
  const trades = useQuery({ queryKey: ["trades"], queryFn: friendsApi.trades, enabled: Boolean(me.data?.username) });
  const tradeCount = (trades.data?.incoming.length ?? 0) + (trades.data?.active.length ?? 0);

  if (me.isLoading) return <p className="muted friends-loading">Loading…</p>;

  return (
    <section className="friends-page">
      <div className="page-head">
        <div>
          <h1>Friends</h1>
          <p className="muted">See each other's decks and trade spare cards.</p>
        </div>
      </div>
      {!me.data?.username ? (
        <UsernamePicker />
      ) : (
        <>
          <Tabs
            label="Friends sections"
            active={tab}
            onChange={(next) => setParams(next === "friends" ? {} : { tab: next }, { replace: true })}
            tabs={[
              { key: "friends", label: "Friends" },
              { key: "trades", label: "Trades", count: tradeCount },
              { key: "spares", label: "My spares" },
            ]}
          />
          {tab === "friends" && <FriendsTabPanel />}
          {tab === "trades" && <TradesPanel />}
          {tab === "spares" && <MySparesPanel />}
        </>
      )}
    </section>
  );
}

function UsernamePicker() {
  const qc = useQueryClient();
  const suggestion = useQuery({ queryKey: ["username-suggestion"], queryFn: friendsApi.suggestUsername, staleTime: Infinity });
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched && suggestion.data?.username) setName(suggestion.data.username);
  }, [suggestion.data, touched]);
  const formatError = name ? usernameFormatError(name) : null;
  const save = useMutation({
    mutationFn: () => friendsApi.setUsername(name.trim()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || formatError || save.isPending) return;
    save.mutate();
  };
  return (
    <form className="friend-card username-picker" onSubmit={submit}>
      <h2>Pick a username</h2>
      <p className="muted">Friends find you by it. It's the same name you use in Duel.</p>
      <label className="friend-field">
        <span>Username</span>
        <input
          value={name}
          maxLength={USERNAME_MAX + 8}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          onChange={(e) => {
            setTouched(true);
            setName(e.target.value);
            save.reset();
          }}
        />
      </label>
      <p className="friend-hint error" role="alert" aria-live="polite">
        {formatError || (save.isError ? (save.error as Error).message : "")}
      </p>
      <button type="submit" className="btn primary" disabled={!name.trim() || Boolean(formatError) || save.isPending}>
        Save username
      </button>
    </form>
  );
}

function FriendsTabPanel() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["friends"], queryFn: friendsApi.list });
  const [username, setUsername] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["friends"] });
    void qc.invalidateQueries({ queryKey: ["trades"] });
    void qc.invalidateQueries({ queryKey: ["trades-summary"] });
  };
  const add = useMutation({
    mutationFn: (name: string) => friendsApi.sendRequest(name),
    onSuccess: (res, name) => {
      setNote(res.status === "accepted" ? `You and ${name} are friends now.` : `Request sent to ${name}.`);
      setUsername("");
      refresh();
    },
    onError: () => setNote(null),
  });
  const accept = useMutation({ mutationFn: friendsApi.accept, onSuccess: refresh });
  const remove = useMutation({ mutationFn: friendsApi.remove, onSuccess: refresh });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const name = username.trim();
    if (!name || add.isPending) return;
    add.mutate(name);
  };
  const mutationError = [accept, remove].find((m) => m.isError)?.error;

  return (
    <div className="friends-grid">
      <div className="friends-col">
        <section className="friend-card" aria-label="Your friends">
          <h2>Your friends</h2>
          {isLoading ? (
            <p className="muted">Loading…</p>
          ) : error ? (
            <LoadError error={error} onRetry={() => void refetch()} />
          ) : data!.friends.length === 0 ? (
            <Empty title="No friends yet">Add a friend by username to see their decks and trade spares.</Empty>
          ) : (
            <ul className="friend-list">
              {data!.friends.map((f) => (
                <li key={f.user_id} className="friend-list-row">
                  <Link to={friendPath(f.username)} className="friend-link">
                    <span className="friend-avatar" aria-hidden>
                      {f.username.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="friend-name">{f.username}</span>
                  </Link>
                  <button
                    type="button"
                    className="ghost danger"
                    disabled={remove.isPending}
                    aria-label={`Remove ${f.username}`}
                    onClick={() => {
                      if (!window.confirm(`Remove ${f.username} from your friends? Open trades with them are cancelled.`)) return;
                      remove.mutate(f.user_id);
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          {mutationError ? <p className="error">{(mutationError as Error).message}</p> : null}
        </section>
      </div>
      <div className="friends-col">
        <SharingCard />
        <form className="friend-card" onSubmit={submit} aria-label="Add a friend">
          <h2>Add a friend</h2>
          <label className="friend-field">
            <span>Their username</span>
            <span className="friend-inline">
              <input
                value={username}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                                onChange={(e) => {
                  setUsername(e.target.value);
                  setNote(null);
                  add.reset();
                }}
              />
              <button type="submit" className="btn primary" disabled={!username.trim() || add.isPending}>
                Send request
              </button>
            </span>
          </label>
          <p className={`friend-hint${add.isError ? " error" : ""}`} role="status" aria-live="polite">
            {add.isError ? (add.error as Error).message : note ?? ""}
          </p>
        </form>
        {data && (data.incoming.length > 0 || data.outgoing.length > 0) && (
          <section className="friend-card" aria-label="Friend requests">
            <h2>Requests</h2>
            <ul className="friend-list">
              {data.incoming.map((r) => (
                <li key={`in-${r.user_id}`} className="friend-list-row">
                  <span className="friend-name">
                    {r.username} <span className="muted">wants to be friends</span>
                  </span>
                  <span className="friend-row-actions">
                    <button type="button" className="btn primary compact" disabled={accept.isPending} onClick={() => accept.mutate(r.user_id)}>
                      Accept
                    </button>
                    <button type="button" className="ghost" disabled={remove.isPending} aria-label={`Decline ${r.username}`} onClick={() => remove.mutate(r.user_id)}>
                      Decline
                    </button>
                  </span>
                </li>
              ))}
              {data.outgoing.map((r) => (
                <li key={`out-${r.user_id}`} className="friend-list-row">
                  <span className="friend-name">
                    {r.username} <span className="muted">request sent</span>
                  </span>
                  <button type="button" className="ghost" disabled={remove.isPending} aria-label={`Cancel request to ${r.username}`} onClick={() => remove.mutate(r.user_id)}>
                    Cancel
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
