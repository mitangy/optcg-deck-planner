import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getOrCreateGuestId } from "../auth/guestId";
import { BountyAmount } from "../Bounty";
import { lookupCard } from "../cards/atlas";
import { getApiBaseUrl, getGameServerUrl, getPlannerUrl } from "../config";
import { resolveCardImageUrl } from "../decks/artPrefs";
import { refreshLinkedDeck } from "../decks/planner";
import {
  deckToWire,
  ensureDefaultDeck,
  ensureTestDecks,
  getSelectedDeckId,
  listSavedDecks,
  setSelectedDeckId,
  type SavedDeck,
} from "../decks/storage";
import {
  fetchAuthMe,
  mintDevGameToken,
  mintGuestGameToken,
  mintSessionGameToken,
  warmDuelServices,
  type AuthUser,
} from "../net/api";
import { clearMatchResume, loadMatchResume } from "../net/matchResume";
import { devKeyAllowed, loadSettings } from "../settings";
import { useDuelSession, type MatchLaunch } from "../state/DuelSession";
import { needsUsername } from "../auth/username";
import { FriendInvites, FriendsPanel, useFriends } from "../friends/FriendsPanel";
import { dismissInvite, inviteFriend, type Friend, type FriendInvite } from "../friends/friendsApi";
import { dismissIosHint, readInstallEnv, shouldShowIosInstallHint } from "../installPrompt";

/** Which play mode the user is configuring inside the Play sheet. */
type PlayMode = "hotseat" | "create" | "join" | "queue" | "spectate";

/** Private-room timer presets (ranked always forces 30s turns). */
type TimerPreset = "off" | "turn_30" | "seat_15m" | "turn_30_seat_15m";

function timerFromPreset(preset: TimerPreset): {
  turnSeconds?: number;
  seatSeconds?: number;
} {
  switch (preset) {
    case "turn_30":
      return { turnSeconds: 30 };
    // Chess clock: 15 minutes each, ticking only while it's that player's move.
    case "seat_15m":
      return { seatSeconds: 15 * 60 };
    case "turn_30_seat_15m":
      return { turnSeconds: 30, seatSeconds: 15 * 60 };
    default:
      return {};
  }
}

const MODE_CARDS: Array<{
  mode: PlayMode;
  title: string;
  blurb: string;
  glyph: string;
}> = [
  {
    mode: "hotseat",
    title: "Practice",
    blurb: "Play both sides on this device.",
    glyph: "☸︎",
  },
  {
    mode: "queue",
    title: "Ranked",
    blurb: "Match a random opponent. 30 second turns.",
    glyph: "⚓︎",
  },
  {
    mode: "create",
    title: "Private room",
    blurb: "Create a room or join a friend's by id.",
    glyph: "✉︎",
  },
  {
    mode: "spectate",
    title: "Spectate",
    blurb: "Watch a room in progress.",
    glyph: "◎︎",
  },
];

function deckLabel(d: SavedDeck): string {
  return `${d.name} — ${lookupCard(d.leaderId).name} (${d.cards.length})`;
}

function DeckPicker({
  id,
  label,
  decks,
  value,
  onChange,
}: {
  id: string;
  label: string;
  decks: SavedDeck[];
  value: string;
  onChange: (id: string) => void;
}) {
  const deck = decks.find((d) => d.id === value) ?? null;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="deck-picker">
        {deck ? (
          <LeaderThumb key={deck.id} deck={deck} className="deck-picker-art" />
        ) : (
          <span className="deck-picker-art" aria-hidden />
        )}
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          {decks.map((d) => (
            <option key={d.id} value={d.id}>
              {deckLabel(d)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function LeaderThumb({ deck, className }: { deck: SavedDeck; className: string }) {
  const art = resolveCardImageUrl(deck.leaderId, { deck, size: "thumb" });
  const [failed, setFailed] = useState<string | null>(null);
  return art && art !== failed ? (
    <img className={className} src={art} alt="" onError={() => setFailed(art)} />
  ) : (
    <span className={`${className} ${className}-empty`} aria-hidden />
  );
}

/** "Sailing with" trigger + popover to switch, edit, or add decks. */
function DeckSwitcher({
  decks,
  selectedDeck,
  onChoose,
}: {
  decks: SavedDeck[];
  selectedDeck: SavedDeck;
  onChoose: (id: string) => void;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="deck-switcher" ref={rootRef}>
      <button
        type="button"
        className={`home-deck${open ? " open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <LeaderThumb key={selectedDeck.id} deck={selectedDeck} className="home-deck-art" />
        <span className="home-deck-text">
          <span className="home-deck-label">Sailing with</span>
          <span className="home-deck-name">{selectedDeck.name}</span>
          <span className="home-deck-leader">{lookupCard(selectedDeck.leaderId).name}</span>
        </span>
        <span className="home-deck-chevron" aria-hidden>
          ▾
        </span>
      </button>

      {open ? (
        <div className="deck-menu" role="listbox" aria-label="Choose a deck">
          <ul className="deck-menu-list">
            {decks.map((d) => {
              const active = d.id === selectedDeck.id;
              return (
                <li key={d.id} className={`deck-menu-row${active ? " active" : ""}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className="deck-menu-pick"
                    onClick={() => {
                      onChoose(d.id);
                      setOpen(false);
                    }}
                  >
                    <LeaderThumb deck={d} className="deck-menu-art" />
                    <span className="deck-menu-text">
                      <span className="deck-menu-name">{d.name}</span>
                      <span className="deck-menu-sub">
                        {lookupCard(d.leaderId).name} · {d.cards.length} cards
                      </span>
                    </span>
                    <span className="deck-menu-check" aria-hidden>
                      {active ? "✓" : ""}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="deck-menu-edit"
                    aria-label={`Edit ${d.name}`}
                    title="Edit deck"
                    onClick={() => navigate(`/decks/${d.id}/configure`)}
                  >
                    Edit
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="deck-menu-foot">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => navigate("/decks/new")}
            >
              + New deck
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => navigate("/decks")}
            >
              Manage decks
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function LobbyPage() {
  const navigate = useNavigate();
  const { client, connect, queueRanked, cancelQueue, queueing, setRating, startMatch } =
    useDuelSession();
  const location = useLocation();
  const [settings] = useState(loadSettings);
  const serverUrl = getGameServerUrl();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [busy, setBusy] = useState(false);
  /** Short status while buttons are disabled (vs-self warm/mint). */
  const [busyStatus, setBusyStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bounty, setBounty] = useState<number | null>(null);

  const [decks, setDecks] = useState<SavedDeck[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [opponentDeckId, setOpponentDeckId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [pendingResume, setPendingResume] = useState<ReturnType<typeof loadMatchResume>>(null);
  const [showIosHint, setShowIosHint] = useState(() => shouldShowIosInstallHint(readInstallEnv()));

  /** Play sheet: closed, choosing a mode, or configuring one. */
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mode, setMode] = useState<PlayMode | null>(null);
  const [timerPreset, setTimerPreset] = useState<TimerPreset>("off");

  const authMode: "guest" | "google" | "dev" = authUser
    ? "google"
    : devKeyAllowed() && settings.useDevKey
      ? "dev"
      : "guest";

  const friendsEnabled = authMode === "google" && Boolean(authUser?.username);
  const friends = useFriends(friendsEnabled);
  /** Also carries why a match request failed after the board opened (DuelPage sends it back). */
  const [friendError, setFriendError] = useState<string | null>(
    () => (location.state as { matchError?: string } | null)?.matchError ?? null,
  );

  /**
   * Shared by the friend actions: open the board at once, then mint + connect
   * behind it. A failure comes back to the lobby as a note.
   */
  function runFriendAction(launch: MatchLaunch, fn: () => Promise<void>) {
    if (authMode === "dev" && !settings.devUserKey.trim()) {
      setFriendError("Set a dev user key in Settings first.");
      return;
    }
    setFriendError(null);
    clearMatchResume();
    startMatch(launch, fn);
    navigate("/duel");
  }

  /** Online matches pull a planner-linked deck fresh first; on any failure the local copy plays. */
  async function freshDeck(d: SavedDeck): Promise<SavedDeck> {
    if (!d.plannerDeckId) return d;
    const fresh = await refreshLinkedDeck(d, 4000);
    if (fresh !== d) refreshDecks();
    return fresh;
  }

  /** Invite: open a fresh private room with the selected deck, then invite the friend to it. */
  function inviteToPrivateRoom(friend: Friend) {
    if (!selectedDeck) {
      setFriendError("Select a deck first.");
      return;
    }
    const launch = { status: `Inviting ${friend.username}…`, leaderId: selectedDeck.leaderId, invite: true };
    runFriendAction(launch, async () => {
      const opts = await authOpts();
      const wire = deckToWire(await freshDeck(selectedDeck));
      await connect({
        ...opts,
        preferredSeat: 0,
        deck: wire,
        createOptions: { ranked: false, players: [wire, wire], timer: {} },
      });
      const roomId = client.roomId;
      // The room is open either way; a failed invite must not strand the host
      // in the lobby while their room sits connected in the background.
      if (roomId) await inviteFriend(friend.user_id, roomId).catch(() => undefined);
    });
  }

  function joinInvite(invite: FriendInvite) {
    if (!selectedDeck) {
      setFriendError("Select a deck first.");
      return;
    }
    const launch = { status: `Joining ${invite.from_username}…`, leaderId: selectedDeck.leaderId, invite: false };
    runFriendAction(launch, async () => {
      const opts = await authOpts();
      try {
        await connect({
          ...opts,
          roomId: invite.room_id,
          deck: deckToWire(await freshDeck(selectedDeck)),
        });
      } catch {
        void dismissInvite(invite.id).finally(() => void friends.refresh());
        throw new Error(`${invite.from_username}'s room is no longer open.`);
      }
      void dismissInvite(invite.id);
    });
  }

  function spectateFriend(friend: Friend) {
    if (!friend.room_id) return;
    const roomId = friend.room_id;
    runFriendAction({ status: `Connecting to ${friend.username}'s match…`, leaderId: null, invite: false }, async () => {
      const opts = await authOpts();
      await connect({ ...opts, roomId, role: "spectator" });
    });
  }

  function refreshDecks() {
    const seeded = ensureDefaultDeck();
    ensureTestDecks();
    const all = listSavedDecks();
    setDecks(all);
    // Prefer the persisted lobby choice — otherwise mount always falls back to ST01 Luffy.
    const prefer = selectedId || getSelectedDeckId() || undefined;
    const sel = (prefer && all.find((d) => d.id === prefer)) || seeded;
    setSelectedId(sel.id);
    setSelectedDeckId(sel.id);
    setOpponentDeckId((prev) => {
      if (prev && all.some((d) => d.id === prev)) return prev;
      // Prefer a different constructed deck for the enemy when available.
      const other = all.find((d) => d.id !== sel.id) ?? sel;
      return other.id;
    });
  }

  useEffect(() => {
    refreshDecks();
    // Offer resume instead of forcing it — browser Back from hotseat used to
    // bounce straight back into the match and made Leave feel broken.
    setPendingResume(loadMatchResume());
    // Invite link (`/?join=<room id>`): open the Join form with the id filled in.
    const inviteRoom = new URLSearchParams(window.location.search).get("join")?.trim();
    if (inviteRoom) {
      setRoomId(inviteRoom);
      setMode("join");
      setSheetOpen(true);
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }
    // Wake free-tier Render API + game-server so hotseat mint/create is warm.
    warmDuelServices(getApiBaseUrl(), serverUrl);
    void fetchAuthMe()
      .then((u) => {
        if (u) setAuthUser(u);
        // Signed in but never picked a username (e.g. closed the tab mid-setup).
        if (needsUsername(u)) navigate("/welcome/username", { replace: true });
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!sheetOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) closeSheet();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen, busy]);

  const selectedDeck = useMemo(
    () => decks.find((d) => d.id === selectedId) ?? null,
    [decks, selectedId],
  );

  function chooseDeck(id: string) {
    setSelectedId(id);
    setSelectedDeckId(id);
  }

  function openSheet() {
    setError(null);
    setMode(null);
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setMode(null);
    setError(null);
  }

  function pickMode(next: PlayMode) {
    setError(null);
    setMode(next);
    if (next === "create") setTimerPreset("off");
  }

  async function authOpts() {
    if (authMode === "guest") {
      const minted = await mintGuestGameToken(getOrCreateGuestId());
      setRating(minted.rating);
      setBounty(minted.rating);
      return { serverUrl, gameToken: minted.token };
    }
    if (authMode === "google") {
      const minted = await mintSessionGameToken();
      setRating(minted.rating);
      setBounty(minted.rating);
      return { serverUrl, gameToken: minted.token };
    }
    const minted = await mintDevGameToken(settings.devUserKey.trim());
    setRating(minted.rating);
    setBounty(minted.rating);
    return { serverUrl, gameToken: minted.token };
  }

  function hotseatUserKey(): string {
    if (authMode === "guest") return getOrCreateGuestId();
    if (authMode === "google" && authUser) return `user-${authUser.id}`;
    return settings.devUserKey.trim() || "web-dev";
  }

  async function confirmSetup() {
    if (!mode) return;
    if (authMode === "dev" && !settings.devUserKey.trim()) {
      setError("Set a dev user key in Settings first.");
      return;
    }
    if ((mode === "join" || mode === "spectate") && !roomId.trim()) {
      setError("Enter a room id.");
      return;
    }
    if (mode !== "spectate" && !selectedDeck) {
      setError("Select a deck first.");
      return;
    }
    setBusy(true);
    setBusyStatus(mode === "hotseat" ? "Starting…" : "Connecting…");
    setError(null);
    try {
      // Starting a new match must not auto-resume a prior room on the next
      // /hotseat or /duel mount (refresh keeps history.state).
      clearMatchResume();
      if (mode === "hotseat") {
        const wire = deckToWire(selectedDeck!);
        setSelectedDeckId(selectedDeck!.id);
        const enemy = decks.find((d) => d.id === opponentDeckId) ?? selectedDeck!;
        // Fire-and-forget wake only — do not block the lobby on free-tier API
        // cold starts. HotseatPage awaits readiness + mints with a visible
        // Starting screen.
        warmDuelServices(getApiBaseUrl(), serverUrl);
        navigate("/hotseat", {
          state: {
            serverUrl,
            userKey: hotseatUserKey(),
            useToken: true,
            deckWire: wire,
            enemyDeckWire: deckToWire(enemy),
            deckName: selectedDeck!.name,
            enemyDeckName: enemy.name,
          },
        });
        return;
      }
      // Online: open the board now and mint / queue / connect behind it, so
      // nobody waits on a Connecting… button (the queue alone can take minutes).
      const picked = selectedDeck!;
      const room = roomId.trim();
      const create = mode === "create";
      startMatch(
        {
          status:
            mode === "queue"
              ? "Searching for an opponent…"
              : mode === "spectate"
                ? "Connecting to the match…"
                : create
                  ? "Opening your room…"
                  : "Joining room…",
          leaderId: mode === "spectate" ? null : picked.leaderId,
          invite: create,
        },
        async () => {
          const opts = await authOpts();
          if (mode === "spectate") {
            await connect({ ...opts, roomId: room, role: "spectator" });
            return;
          }
          const wire = deckToWire(await freshDeck(picked));
          if (mode === "queue") {
            await queueRanked({ ...opts, deck: wire });
            return;
          }
          await connect({
            ...opts,
            roomId: mode === "join" ? room : undefined,
            preferredSeat: create ? 0 : undefined,
            deck: wire,
            createOptions: create
              ? { ranked: false, players: [wire, wire], timer: timerFromPreset(timerPreset) }
              : undefined,
          });
        },
      );
      if (mode !== "spectate") setSelectedDeckId(picked.id);
      navigate("/duel");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connect failed");
    } finally {
      setBusy(false);
      setBusyStatus(null);
    }
  }

  const accountName =
    authMode === "google" && authUser
      ? authUser.username || authUser.email
      : authMode === "dev"
        ? `Dev · ${settings.devUserKey || "web-dev"}`
        : "Guest";

  const modeTitle =
    mode === "hotseat"
      ? "Practice"
      : mode === "create" || mode === "join"
        ? "Private room"
        : mode === "queue"
          ? "Ranked"
          : mode === "spectate"
            ? "Spectate"
            : "Play";

  const confirmLabel =
    mode === "hotseat"
      ? "Start practice"
      : mode === "create"
        ? "Create room"
        : mode === "join"
          ? "Join room"
          : mode === "queue"
            ? "Find match"
            : "Watch";

  return (
    <div className="app-shell home-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <span className="topbar-mark" aria-hidden />
          <div className="topbar-right">
            <Link to="/settings" className="account-chip" title="Account settings">
              <span className="account-dot" data-mode={authMode} aria-hidden />
              <span className="account-name">{accountName}</span>
              {bounty != null ? (
                <span className="account-rating" title="Bounty">
                  <BountyAmount amount={bounty} />
                </span>
              ) : null}
            </Link>
            <a
              href={getPlannerUrl()}
              target="_blank"
              rel="noopener"
              className="icon-btn"
              aria-label="Deck planner"
              title="Deck planner"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                <path
                  fill="currentColor"
                  d="M8 2h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm0 2v14h11V4H8Zm2 3h7v2h-7V7Zm0 4h7v2h-7v-2ZM3 6h1v16h13v1a1 1 0 0 1-1 1H4a2 2 0 0 1-2-2V7a1 1 0 0 1 1-1Z"
                />
              </svg>
            </a>
            <Link to="/settings" className="icon-btn" aria-label="Settings" title="Settings">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                <path
                  fill="currentColor"
                  d="M19.14 12.94a7.6 7.6 0 0 0 .06-.94 7.6 7.6 0 0 0-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.3 7.3 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.49.42l-.36 2.54c-.59.24-1.13.56-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.48a.5.5 0 0 0 .12.64l2.03 1.58a7.6 7.6 0 0 0 0 1.88L2.83 14.16a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.3.6.22l2.39-.96c.5.38 1.04.7 1.63.94l.36 2.54c.05.24.25.42.49.42h3.8c.24 0 .45-.18.49-.42l.36-2.54c.59-.24 1.13-.56 1.63-.94l2.39.96c.22.08.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"
                />
              </svg>
            </Link>
          </div>
        </div>
      </header>

      <main className="home">
        <div className="home-hero">
          <p className="home-kicker">One Piece Card Game</p>
          <h1 className="home-brand">OPTCG Duel</h1>
          <div className="home-rule" aria-hidden>
            <span />
          </div>
        </div>

        {showIosHint ? (
          <section className="notice" aria-label="Install on your iPhone">
            <div className="notice-body">
              <strong>Install on your iPhone</strong>
              <span>
                Tap Share, then Add to Home Screen. It opens full screen with no browser bars.
              </span>
            </div>
            <div className="notice-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  dismissIosHint(readInstallEnv());
                  setShowIosHint(false);
                }}
              >
                Dismiss
              </button>
            </div>
          </section>
        ) : null}

        {pendingResume ? (
          <section className="notice notice-gold" aria-label="Resume match">
            <div className="notice-body">
              <strong>Match in progress</strong>
              <span>
                A {pendingResume.mode === "hotseat" ? "practice" : "online"} match is saved in
                this tab.
              </span>
            </div>
            <div className="notice-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() =>
                  navigate(pendingResume.mode === "hotseat" ? "/hotseat" : "/duel", {
                    replace: true,
                  })
                }
              >
                Resume
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  clearMatchResume();
                  setPendingResume(null);
                }}
              >
                Discard
              </button>
            </div>
          </section>
        ) : null}

        {queueing ? (
          <section className="notice" aria-live="polite">
            <div className="notice-body">
              <strong>Searching for an opponent…</strong>
              <span>Ranked queue · 30 second turns</span>
            </div>
            <div className="notice-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => void cancelQueue()}
              >
                Cancel
              </button>
            </div>
          </section>
        ) : null}

        {friends.state ? (
          <FriendInvites
            invites={friends.state.invites}
            busy={busy || queueing}
            onJoin={joinInvite}
            onDismissed={() => void friends.refresh()}
          />
        ) : null}

        <div className="home-actions">
          <button
            type="button"
            className="btn btn-play"
            disabled={busy || queueing}
            onClick={openSheet}
          >
            Play
          </button>
        </div>

        {selectedDeck ? (
          <DeckSwitcher decks={decks} selectedDeck={selectedDeck} onChoose={chooseDeck} />
        ) : null}

        {friendError ? <p className="error-text">{friendError}</p> : null}
        {busy && busyStatus && !sheetOpen ? <p className="friends-note">{busyStatus}</p> : null}
        <FriendsPanel
          signedIn={friendsEnabled}
          state={friends.state}
          loadError={friends.loadError}
          refresh={friends.refresh}
          busy={busy || queueing}
          onInvite={inviteToPrivateRoom}
          onSpectate={spectateFriend}
        />
      </main>

      {sheetOpen ? (
        <div
          className="sheet-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) closeSheet();
          }}
        >
          <div className="sheet" role="dialog" aria-modal="true" aria-label={modeTitle}>
            <div className="sheet-head">
              {mode ? (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Back to modes"
                  disabled={busy}
                  onClick={() => {
                    setError(null);
                    setMode(null);
                  }}
                >
                  ←
                </button>
              ) : (
                <span className="icon-btn-spacer" aria-hidden />
              )}
              <h2 className="sheet-title">{modeTitle}</h2>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close"
                disabled={busy}
                onClick={closeSheet}
              >
                ✕
              </button>
            </div>

            {!mode ? (
              <div className="mode-grid">
                {MODE_CARDS.map((m) => (
                  <button
                    key={m.mode}
                    type="button"
                    className="mode-card"
                    onClick={() => pickMode(m.mode)}
                  >
                    <span className="mode-glyph" aria-hidden>
                      {m.glyph}
                    </span>
                    <span className="mode-title">{m.title}</span>
                    <span className="mode-blurb">{m.blurb}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="sheet-body">
                {mode === "create" || mode === "join" ? (
                  <div className="segmented" role="tablist" aria-label="Private room">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === "create"}
                      className={mode === "create" ? "active" : ""}
                      onClick={() => pickMode("create")}
                    >
                      Create
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === "join"}
                      className={mode === "join" ? "active" : ""}
                      onClick={() => pickMode("join")}
                    >
                      Join
                    </button>
                  </div>
                ) : null}

                {mode !== "spectate" ? (
                  <DeckPicker
                    id="setup-deck"
                    label="Your deck"
                    decks={decks}
                    value={selectedId}
                    onChange={chooseDeck}
                  />
                ) : null}

                {mode === "hotseat" ? (
                  <DeckPicker
                    id="enemy-deck"
                    label="Opponent deck"
                    decks={decks}
                    value={opponentDeckId}
                    onChange={setOpponentDeckId}
                  />
                ) : null}

                {mode === "create" ? (
                  <div className="field">
                    <label htmlFor="timer-preset">Timer</label>
                    <select
                      id="timer-preset"
                      value={timerPreset}
                      onChange={(e) => setTimerPreset(e.target.value as TimerPreset)}
                    >
                      <option value="off">No timer</option>
                      <option value="turn_30">30 second turns</option>
                      <option value="seat_15m">15 minutes per player</option>
                      <option value="turn_30_seat_15m">30s turns + 15 min per player</option>
                    </select>
                    <p className="field-hint">
                      {timerPreset === "seat_15m" || timerPreset === "turn_30_seat_15m"
                        ? "Each player's clock only runs while it's their move; whoever runs out loses. "
                        : ""}
                      Private rooms are unranked.
                    </p>
                  </div>
                ) : null}

                {mode === "join" || mode === "spectate" ? (
                  <div className="field">
                    <label htmlFor="room">Room id</label>
                    <input
                      id="room"
                      autoCapitalize="off"
                      autoCorrect="off"
                      value={roomId}
                      onChange={(e) => setRoomId(e.target.value)}
                      placeholder="Paste the room id"
                    />
                  </div>
                ) : null}

                {mode === "queue" ? (
                  <p className="field-hint">
                    Ranked always enforces 30 second turns. Your Bounty updates after the match.
                  </p>
                ) : null}

                {error ? <p className="error-text">{error}</p> : null}

                <button
                  type="button"
                  className="btn btn-primary btn-lg sheet-confirm"
                  disabled={busy || queueing}
                  onClick={() => void confirmSetup()}
                >
                  {busy && busyStatus ? busyStatus : confirmLabel}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
