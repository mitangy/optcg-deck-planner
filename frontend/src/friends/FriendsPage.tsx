import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMe } from "../auth/useMe";
import { SharingCard } from "./SharingCard";
import { TradesPanel } from "./TradesPanel";
import { MySparesPanel } from "./MySparesPanel";
import { friendsApi } from "./friendsApi";
import { Empty, LoadError, Tabs } from "./ui";
import { USERNAME_MAX, usernameFormatError } from "@optcg/ui/username";
import { Menu, MenuButton, MenuItem, MenuList, useConfirm } from "@optcg/ui/popups";
import { copyText } from "@optcg/ui/clipboard";
import { avatarTone } from "./avatarTone";
import { tradesTabCount } from "./tradeLogic";
import { qk } from "../cache/queryKeys";

type FriendsTab = "friends" | "trades" | "spares";
const TABS: FriendsTab[] = ["friends", "trades", "spares"];

const friendPath = (username: string) => `/friends/${encodeURIComponent(username)}`;

export function FriendsPage() {
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: FriendsTab = TABS.includes(raw as FriendsTab) ? (raw as FriendsTab) : "friends";
  const trades = useQuery({ queryKey: qk.trades(), queryFn: friendsApi.trades, enabled: Boolean(me.data?.username) });
  const tradeCount = tradesTabCount(trades.data);

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
  const suggestion = useQuery({ queryKey: qk.usernameSuggestion(), queryFn: friendsApi.suggestUsername, staleTime: Infinity });
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched && suggestion.data?.username) setName(suggestion.data.username);
  }, [suggestion.data, touched]);
  const formatError = name ? usernameFormatError(name) : null;
  const save = useMutation({
    mutationFn: () => friendsApi.setUsername(name.trim()),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me() }),
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
  const me = useMe();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: qk.friends(), queryFn: friendsApi.list });
  const trades = useQuery({ queryKey: qk.trades(), queryFn: friendsApi.trades });
  const [username, setUsername] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { confirm, confirmDialog } = useConfirm();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.friends() });
    void qc.invalidateQueries({ queryKey: qk.trades() });
    void qc.invalidateQueries({ queryKey: qk.tradesSummary() });
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
  const myName = me.data?.username ?? "";
  const incoming = data?.incoming ?? [];
  const offersWaiting = trades.data?.incoming.length ?? 0;
  const hint = add.isError ? (add.error as Error).message : (note ?? "");

  return (
    <>
      {(incoming.length > 0 || offersWaiting > 0) && (
        <section className="friend-card friends-needs-you" aria-label="Needs you">
          <h2>Needs you</h2>
          {incoming.length > 0 && (
            <ul className="friend-list">
              {incoming.map((r) => (
                <li key={`in-${r.user_id}`} className="friend-list-row">
                  <span className="friend-link">
                    <span className="friend-avatar" data-tone={avatarTone(r.username)} aria-hidden>
                      {r.username.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="friend-name">
                      {r.username} <span className="muted">wants to be friends</span>
                    </span>
                  </span>
                  <span className="friend-row-actions">
                    <button type="button" className="btn primary compact friends-act" disabled={accept.isPending} aria-label={`Accept ${r.username}`} onClick={() => accept.mutate(r.user_id)}>
                      Accept
                    </button>
                    <button type="button" className="ghost friends-act" disabled={remove.isPending} aria-label={`Decline ${r.username}`} onClick={() => remove.mutate(r.user_id)}>
                      Decline
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {offersWaiting > 0 && (
            <p className="friends-needs-link">
              <Link to="/friends?tab=trades">
                {offersWaiting} trade {offersWaiting === 1 ? "offer" : "offers"} waiting for your answer →
              </Link>
            </p>
          )}
        </section>
      )}
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
              <ul className="friend-list friends-tiles">
                {data!.friends.map((f) => (
                  <li key={f.user_id} className="friend-list-row">
                    <Link to={friendPath(f.username)} className="friend-link">
                      <span className="friend-avatar" data-tone={avatarTone(f.username)} aria-hidden>
                        {f.username.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="friend-name">{f.username}</span>
                    </Link>
                    <span className="friend-row-actions">
                      <Link to={`${friendPath(f.username)}?tab=spares`} className="btn secondary compact friends-act friends-offer">
                        Offer a trade
                      </Link>
                      <Menu as="div" className="friends-row-menu">
                        <MenuButton type="button" className="ghost friends-more" aria-label={`More for ${f.username}`}>
                          <span aria-hidden>⋯</span>
                        </MenuButton>
                        <MenuList anchor={{ to: "bottom end", gap: 4, padding: 8 }} className="friends-row-menu-list">
                          <MenuItem>
                            <button
                              type="button"
                              className="friends-menu-item danger"
                              disabled={remove.isPending}
                              onClick={async () => {
                                const ok = await confirm({
                                  title: `Remove ${f.username}?`,
                                  message: "Open trades with them are cancelled.",
                                  confirmLabel: "Remove",
                                });
                                if (ok) remove.mutate(f.user_id);
                              }}
                            >
                              Remove friend
                            </button>
                          </MenuItem>
                        </MenuList>
                      </Menu>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {mutationError ? <p className="error">{(mutationError as Error).message}</p> : null}
            {confirmDialog}
          </section>
        </div>
        <div className="friends-col">
          <SharingCard />
          <form className="friend-card" onSubmit={submit} aria-label="Add a friend">
            <h2>Add a friend</h2>
            {myName && (
              <p className="friends-me">
                <span className="muted">Your username:</span> <strong>{myName}</strong>
                <button
                  type="button"
                  className="ghost friends-act friends-copy"
                  onClick={async () => {
                    if (await copyText(myName)) {
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1600);
                    }
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </p>
            )}
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
            <p className={`friend-hint${add.isError ? " error" : ""}${hint ? "" : " empty"}`} role="status" aria-live="polite">
              {hint}
            </p>
          </form>
          {data && data.outgoing.length > 0 && (
            <section className="friend-card" aria-label="Sent requests">
              <h2>Sent requests</h2>
              <ul className="friend-list">
                {data.outgoing.map((r) => (
                  <li key={`out-${r.user_id}`} className="friend-list-row">
                    <span className="friend-name">
                      {r.username} <span className="muted">request sent</span>
                    </span>
                    <button type="button" className="ghost friends-act" disabled={remove.isPending} aria-label={`Cancel request to ${r.username}`} onClick={() => remove.mutate(r.user_id)}>
                      Cancel
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
