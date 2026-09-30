import { useCallback, useEffect, useRef, useState } from "react";
import {
  acceptFriendRequest,
  dismissInvite,
  fetchFriends,
  friendActions,
  removeFriend,
  sendFriendRequest,
  statusLabel,
  type Friend,
  type FriendInvite,
  type FriendsState,
} from "./friendsApi";
import "./friends.css";

const POLL_MS = 10_000;

/**
 * Friends list + incoming invites for a signed-in player. Polls while the tab is
 * visible; each poll also marks this player "online" for their friends.
 */
export function useFriends(enabled: boolean) {
  const [state, setState] = useState<FriendsState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchFriends();
      if (!alive.current) return;
      setState(next);
      setLoadError(null);
    } catch (e) {
      if (alive.current) setLoadError(e instanceof Error ? e.message : "Could not load friends");
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    if (!enabled) {
      setState(null);
      return () => {
        alive.current = false;
      };
    }
    void refresh();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive.current = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, refresh]);

  return { state, loadError, refresh };
}

export function FriendInvites({
  invites,
  busy,
  onJoin,
  onDismissed,
}: {
  invites: FriendInvite[];
  busy: boolean;
  onJoin: (invite: FriendInvite) => void;
  onDismissed: () => void;
}) {
  if (invites.length === 0) return null;
  return (
    <>
      {invites.map((inv) => (
        <section key={inv.id} className="notice notice-gold" aria-label="Game invite">
          <div className="notice-body">
            <strong>{inv.from_username} invited you</strong>
            <span>Private room · your selected deck</span>
          </div>
          <div className="notice-actions">
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => onJoin(inv)}>
              Join
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() => void dismissInvite(inv.id).finally(onDismissed)}
            >
              Dismiss
            </button>
          </div>
        </section>
      ))}
    </>
  );
}

function FriendRow({
  friend,
  busy,
  onInvite,
  onSpectate,
  onRemove,
}: {
  friend: Friend;
  busy: boolean;
  onInvite: (f: Friend) => void;
  onSpectate: (f: Friend) => void;
  onRemove: (f: Friend) => void;
}) {
  const actions = friendActions(friend);
  return (
    <li className="friend-row">
      <span className="friend-dot" data-status={friend.status} aria-hidden />
      <span className="friend-text">
        <span className="friend-name">{friend.username}</span>
        <span className="friend-status">{statusLabel(friend)}</span>
      </span>
      <span className="friend-actions">
        {actions.invite ? (
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onInvite(friend)}>
            Invite
          </button>
        ) : null}
        {actions.spectate ? (
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onSpectate(friend)}>
            Watch
          </button>
        ) : null}
        <button
          type="button"
          className="icon-btn friend-remove"
          aria-label={`Remove ${friend.username}`}
          title="Remove friend"
          disabled={busy}
          onClick={() => onRemove(friend)}
        >
          ✕
        </button>
      </span>
    </li>
  );
}

export function FriendsPanel({
  signedIn,
  state,
  loadError,
  refresh,
  busy,
  onInvite,
  onSpectate,
}: {
  signedIn: boolean;
  state: FriendsState | null;
  loadError: string | null;
  refresh: () => Promise<void>;
  busy: boolean;
  onInvite: (f: Friend) => void;
  onSpectate: (f: Friend) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const [working, setWorking] = useState(false);

  if (!signedIn) {
    return (
      <section className="friends" aria-label="Friends">
        <div className="friends-head">
          <h2 className="friends-title">Friends</h2>
        </div>
        <p className="friends-empty">Sign in with Google in Settings to add friends, invite them, and watch their games.</p>
      </section>
    );
  }

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setWorking(true);
    setNote(null);
    try {
      await fn();
      if (ok) setNote({ text: ok, error: false });
      await refresh();
    } catch (e) {
      setNote({ text: e instanceof Error ? e.message : "Something went wrong", error: true });
    } finally {
      setWorking(false);
    }
  }

  async function submitAdd() {
    const username = name.trim();
    if (!username) return;
    await run(async () => {
      const status = await sendFriendRequest(username);
      setName("");
      setNote({ text: status === "accepted" ? `You and ${username} are now friends.` : `Request sent to ${username}.`, error: false });
    });
  }

  const friends = state?.friends ?? [];
  const incoming = state?.incoming ?? [];
  const outgoing = state?.outgoing ?? [];
  const onlineCount = friends.filter((f) => f.status !== "offline").length;
  const disabled = busy || working;

  return (
    <section className="friends" aria-label="Friends">
      <div className="friends-head">
        <h2 className="friends-title">
          Friends
          {friends.length > 0 ? <span className="friends-count">{onlineCount} online</span> : null}
        </h2>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-expanded={adding}
          onClick={() => {
            setAdding((v) => !v);
            setNote(null);
          }}
        >
          {adding ? "Close" : "Add friend"}
        </button>
      </div>

      {adding ? (
        <form
          className="friends-add"
          onSubmit={(e) => {
            e.preventDefault();
            void submitAdd();
          }}
        >
          <input
            aria-label="Friend's username"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={20}
            placeholder="Their username"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={disabled || !name.trim()}>
            Send
          </button>
        </form>
      ) : null}

      {note ? <p className={note.error ? "error-text" : "friends-note"}>{note.text}</p> : null}
      {loadError && !state ? <p className="error-text">{loadError}</p> : null}

      {incoming.length > 0 ? (
        <ul className="friends-list">
          {incoming.map((r) => (
            <li key={r.user_id} className="friend-row">
              <span className="friend-text">
                <span className="friend-name">{r.username}</span>
                <span className="friend-status">Wants to be friends</span>
              </span>
              <span className="friend-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={disabled}
                  onClick={() => void run(() => acceptFriendRequest(r.user_id))}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={disabled}
                  onClick={() => void run(() => removeFriend(r.user_id))}
                >
                  Decline
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {friends.length > 0 ? (
        <ul className="friends-list">
          {friends.map((f) => (
            <FriendRow
              key={f.user_id}
              friend={f}
              busy={disabled}
              onInvite={onInvite}
              onSpectate={onSpectate}
              onRemove={(fr) => {
                if (window.confirm(`Remove ${fr.username} from your friends?`)) {
                  void run(() => removeFriend(fr.user_id));
                }
              }}
            />
          ))}
        </ul>
      ) : state && incoming.length === 0 ? (
        <p className="friends-empty">Add friends by username to invite them to private games.</p>
      ) : null}

      {outgoing.length > 0 ? (
        <ul className="friends-list">
          {outgoing.map((r) => (
            <li key={r.user_id} className="friend-row">
              <span className="friend-text">
                <span className="friend-name">{r.username}</span>
                <span className="friend-status">Request sent</span>
              </span>
              <span className="friend-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={disabled}
                  onClick={() => void run(() => removeFriend(r.user_id))}
                >
                  Cancel
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
