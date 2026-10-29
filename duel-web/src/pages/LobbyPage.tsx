import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Tab, TabGroup, TabList } from "@optcg/ui/tabs";
import { getOrCreateGuestId } from "../auth/guestId";
import { BountyAmount } from "../Bounty";
import { lookupCard } from "../cards/atlas";
import { isIncompleteDeck } from "../decks/deckStatus";
import { NavMenu } from "../nav/NavMenu";
import { getApiBaseUrl, getGameServerUrl, getPlannerUrl } from "../config";
import { resolveCardImageUrl } from "../decks/artPrefs";
import { useArtFallback } from "../cards/useArtFallback";
import { refreshLinkedDeck } from "../decks/planner";
import { useSavedDecksVersion } from "../decks/useSavedDecksVersion";
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
  fetchRatingMe,
  googleLoginUrl,
  mintDevGameToken,
  mintGuestGameToken,
  mintOwnerToken,
  mintSessionGameToken,
  warmDuelServices,
  type AuthUser,
  type RatingMe,
} from "../net/api";
import { gameServerUrlFor, rememberedGameServerUrl, roomServerUrl } from "../net/gameServer";
import { clearMatchResume, loadMatchResume } from "../net/matchResume";
import {
  activeMatchModeLabel,
  fetchActiveMatches,
  pickOtherDeviceMatch,
  type ActiveMatch,
} from "../net/activeMatches";
import { devKeyAllowed, loadSettings } from "../settings";
import { LaunchCancelledError, useDuelSession, type MatchLaunch } from "../state/DuelSession";
import { needsUsername } from "../auth/username";
import { FriendInvites, FriendsPanel, useFriends } from "../friends/FriendsPanel";
import { dismissInvite, inviteFriend, inviteFrom, type Friend, type FriendInvite } from "../friends/friendsApi";
import { dismissIosHint, readInstallEnv, shouldShowIosInstallHint } from "../installPrompt";
import { UpdateNotice, VersionStatus } from "../VersionStatus";
import { WhatsNewCard } from "@optcg/patch-notes";
import { EventBanner } from "../events/EventBanner";
import { IntroStrip } from "../home/IntroStrip";
import { LiveLine } from "../home/LiveLine";
import { LogPoseTile } from "../home/LogPoseTile";
import { OnlyOnDuel } from "../home/OnlyOnDuel";
import { BrandWordmark } from "../BrandMark";
import { TopBounties } from "../home/TopBounties";
import { VoyageCard } from "../home/VoyageCard";
import { introDone, introVisible, markIntroDone } from "../home/intro";
import { leaderGlow } from "../home/leaderGlow";
import { Dialog, Listbox, ListboxButton, ListboxList, ListboxOption, Select } from "@optcg/ui/popups";
import { readLastMode, writeLastMode, type LastMode } from "../home/lastMode";
import {
  BOT_DECK_MIRROR,
  BOT_LEVELS,
  DEFAULT_BOT_LEVEL,
  botCreateOptions,
  resolveBotDeck,
  type BotLevel,
} from "../home/botGame";
import { modeTiles, primaryAction } from "../home/primaryAction";

const SPECTATE_GONE = /not found|locked/i;
export const SPECTATE_GONE_MESSAGE = "That match has ended or the spectate link is wrong.";

/** Which play mode the user is configuring inside the Play sheet. */
type PlayMode = "hotseat" | "bot" | "create" | "join" | "queue" | "spectate";

/** Private-room timer presets (ranked always forces a 15 minute chess clock per player). */
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
  /** Under the title on the home tiles. */
  short: string;
  glyph: string;
}> = [
  {
    mode: "hotseat",
    title: "Practice",
    blurb: "Play both sides on this device.",
    short: "Both sides",
    glyph: "☸︎",
  },
  {
    mode: "bot",
    title: "Play vs Bot",
    blurb: "Play the computer. Casual, never ranked.",
    short: "Vs computer",
    glyph: "⚙︎",
  },
  {
    mode: "queue",
    title: "Ranked",
    blurb: "Match a random opponent. 15 minutes per player.",
    short: "15 min each",
    glyph: "⚓︎",
  },
  {
    mode: "create",
    title: "Private room",
    blurb: "Create a room or join a friend's by id.",
    short: "Play a friend",
    glyph: "✉︎",
  },
  {
    mode: "spectate",
    title: "Spectate",
    blurb: "Watch a room in progress.",
    short: "Watch a room",
    glyph: "◎︎",
  },
];

function deckLabel(d: SavedDeck): string {
  return `${d.name} — ${lookupCard(d.leaderId).name} (${d.cards.length}${isIncompleteDeck(d) ? "/50" : ""})`;
}

function IncompleteBadge({ deck }: { deck: SavedDeck }) {
  return isIncompleteDeck(deck) ? (
    <span className="deck-incomplete-badge" title={`${deck.cards.length} of 50 main-deck cards`}>
      Incomplete
    </span>
  ) : null;
}

function DeckPicker({
  id,
  label,
  decks,
  value,
  onChange,
  mirror,
}: {
  id: string;
  label: string;
  decks: SavedDeck[];
  value: string;
  onChange: (id: string) => void;
  /** Adds a first option with an empty value that plays this deck (e.g. "Same as your deck"). */
  mirror?: { label: string; deck: SavedDeck | null };
}) {
  const deck = decks.find((d) => d.id === value) ?? (value === "" ? (mirror?.deck ?? null) : null);
  return (
    <div className="field">
      <label htmlFor={id}>
        {label} {deck ? <IncompleteBadge deck={deck} /> : null}
      </label>
      <div className="deck-picker">
        {deck ? (
          <LeaderThumb key={deck.id} deck={deck} className="deck-picker-art" />
        ) : (
          <span className="deck-picker-art" aria-hidden />
        )}
        <Select
          id={id}
          value={value}
          onChange={onChange}
          options={[
            ...(mirror ? [{ value: "", label: mirror.label }] : []),
            ...decks.map((d) => ({ value: d.id, label: deckLabel(d) })),
          ]}
        />
      </div>
    </div>
  );
}

function LeaderThumb({ deck, className }: { deck: SavedDeck; className: string }) {
  const { src: art, fail } = useArtFallback(
    resolveCardImageUrl(deck.leaderId, { deck, size: "thumb" }),
    deck.leaderId,
  );
  return art ? (
    <img className={className} src={art} alt="" onError={fail} />
  ) : (
    <span className={`${className} ${className}-empty`} aria-hidden />
  );
}

/** Rows of the switcher's footer: they ride in the Listbox so the keyboard reaches them like a deck. */
const NEW_DECK = "__new-deck__";
const MANAGE_DECKS = "__manage-decks__";

/**
 * "Sailing with" trigger + a Headless UI Listbox to switch decks. Arrow keys, Home / End, type-ahead,
 * Enter, Escape (focus back on the trigger) and outside click come from the Listbox; the list floats
 * under the trigger in a portal, so opening it never moves the page. The footer's New deck and
 * Manage decks are options too (picking one navigates), so the keyboard reaches them.
 */
export function DeckSwitcher({
  decks,
  selectedDeck,
  onChoose,
}: {
  decks: SavedDeck[];
  selectedDeck: SavedDeck;
  onChoose: (id: string) => void;
}) {
  const navigate = useNavigate();
  const glow = leaderGlow(lookupCard(selectedDeck.leaderId).colors);

  function pick(value: string) {
    if (value === NEW_DECK) navigate("/decks/new");
    else if (value === MANAGE_DECKS) navigate("/decks");
    else onChoose(value);
  }

  return (
    <Listbox value={selectedDeck.id} onChange={pick}>
      {({ open }: { open: boolean }) => (
        <div className="deck-switcher">
          <ListboxButton
            className={`home-deck${open ? " open" : ""}`}
            style={glow ? ({ "--glow": glow } as CSSProperties) : undefined}
          >
            <LeaderThumb key={selectedDeck.id} deck={selectedDeck} className="home-deck-art" />
            <span className="home-deck-text">
              <span className="home-deck-label">Sailing with</span>
              <span className="home-deck-name">{selectedDeck.name}</span>
              <span className="home-deck-leader">
                {lookupCard(selectedDeck.leaderId).name} · {selectedDeck.cards.length} cards{" "}
                <IncompleteBadge deck={selectedDeck} />
              </span>
              <span className="home-deck-change">
                Change deck{" "}
                <span className="home-deck-chevron" aria-hidden>
                  ▾
                </span>
              </span>
            </span>
          </ListboxButton>
          <Link to={`/decks/${selectedDeck.id}/configure`} className="home-deck-edit">
            Edit deck
          </Link>

          <ListboxList anchor={{ to: "bottom start", gap: 6, padding: 8 }} className="deck-menu">
            <div className="deck-menu-list">
              {decks.map((d) => {
                const active = d.id === selectedDeck.id;
                return (
                  <ListboxOption
                    as="div"
                    key={d.id}
                    value={d.id}
                    className={`deck-menu-row${active ? " active" : ""}`}
                  >
                    <div className="deck-menu-pick">
                      <LeaderThumb deck={d} className="deck-menu-art" />
                      <span className="deck-menu-text">
                        <span className="deck-menu-name">{d.name}</span>
                        <span className="deck-menu-sub">
                          {lookupCard(d.leaderId).name} · {d.cards.length} cards <IncompleteBadge deck={d} />
                        </span>
                      </span>
                      <span className="deck-menu-check" aria-hidden>
                        {active ? "✓" : ""}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="deck-menu-edit"
                      aria-label={`Edit ${d.name}`}
                      title="Edit deck"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/decks/${d.id}/configure`);
                      }}
                    >
                      Edit
                    </button>
                  </ListboxOption>
                );
              })}
            </div>
            <div className="deck-menu-foot">
              <ListboxOption as="div" value={NEW_DECK} className="btn btn-secondary btn-sm">
                + New deck
              </ListboxOption>
              <ListboxOption as="div" value={MANAGE_DECKS} className="btn btn-ghost btn-sm">
                Manage decks
              </ListboxOption>
            </div>
          </ListboxList>
        </div>
      )}
    </Listbox>
  );
}

export function LobbyPage() {
  const navigate = useNavigate();
  const { client, connect, queueRanked, cancelQueue, queueing, setRating, startMatch, takeOver } =
    useDuelSession();
  const location = useLocation();
  // `/watch/:roomId` (a shared spectate link) goes straight into that match.
  const watchRoomId = useParams<{ roomId: string }>().roomId?.trim() || null;
  const [searchParams] = useSearchParams();
  const watchSeat = searchParams.get("seat") === "2" ? 1 : 0;
  /** Sign-in has settled, so a spectate link knows which token to mint. */
  const [authChecked, setAuthChecked] = useState(false);
  const watchStarted = useRef(false);
  const [settings] = useState(loadSettings);
  const serverUrl = getGameServerUrl();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [busy, setBusy] = useState(false);
  /** Short status while buttons are disabled (vs-self warm/mint). */
  const [busyStatus, setBusyStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bounty, setBounty] = useState<number | null>(null);
  /** Your Bounty, record and rank: undefined while loading, null when signed out or the call failed. */
  const [me, setMe] = useState<RatingMe | null | undefined>(undefined);
  const [lastMode, setLastMode] = useState<LastMode | null>(() => readLastMode());
  const [introClosed, setIntroClosed] = useState(() => introDone());

  const [decks, setDecks] = useState<SavedDeck[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [opponentDeckId, setOpponentDeckId] = useState("");
  /** Play vs Bot: how strong the bot is, and which saved deck it plays ("" = a copy of yours). */
  const [botLevel, setBotLevel] = useState<BotLevel>(DEFAULT_BOT_LEVEL);
  const [botDeckId, setBotDeckId] = useState(BOT_DECK_MIRROR);
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

  /** Account that could hold a match on another device (guest ids are per browser). */
  const matchOwner: "session" | "dev" | undefined =
    authMode === "google" ? "session" : authMode === "dev" && settings.devUserKey.trim() ? "dev" : undefined;
  /** A live match this account holds a seat in that this tab does not already resume (#451). */
  const [otherDevice, setOtherDevice] = useState<ActiveMatch | null>(null);

  useEffect(() => {
    if (!authChecked || !matchOwner) {
      setOtherDevice(null);
      return;
    }
    let cancelled = false;
    async function refresh() {
      try {
        const token = await mintOwnerToken(matchOwner, settings.devUserKey.trim());
        if (!token || cancelled) return;
        const matches = await fetchActiveMatches(serverUrl, token);
        if (cancelled) return;
        setOtherDevice(pickOtherDeviceMatch(matches, loadMatchResume()));
      } catch {
        /* optional card: stay silent */
      }
    }
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, matchOwner]);

  function resumeOnThisDevice(m: ActiveMatch) {
    clearMatchResume();
    if (m.practice) {
      navigate("/hotseat", {
        state: {
          serverUrl,
          userKey: hotseatUserKey(),
          useToken: true,
          deckWire: { leaderId: "", deck: [] },
          deckName: "",
          owner: matchOwner,
          takeover: { roomId: m.roomId },
        },
      });
      return;
    }
    const devKey = settings.devUserKey.trim();
    takeOver(m.roomId, m.seats[0], async () => {
      const token = await mintOwnerToken(matchOwner, devKey);
      if (!token) throw new Error("Sign in to move a match to this device.");
      return token;
    });
    navigate("/duel");
  }

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
  function runFriendAction(
    launch: MatchLaunch,
    fn: (launchGen: number) => Promise<void>,
    navOpts?: { replace?: boolean },
  ) {
    if (authMode === "dev" && !settings.devUserKey.trim()) {
      setFriendError("Set a dev user key in Settings first.");
      return;
    }
    setFriendError(null);
    clearMatchResume();
    startMatch(launch, fn);
    navigate("/duel", navOpts);
  }

  /** Join a room as a spectator; a room that is gone reads as a bad / finished link. */
  async function connectSpectator(room: string, gen: number, preferredSeat?: 0 | 1, serverHint?: string | null) {
    const opts = await authOpts();
    try {
      await connect(
        { ...opts, serverUrl: roomServerUrl(opts.serverUrl, serverHint), roomId: room, role: "spectator", preferredSeat },
        gen,
      );
    } catch (e) {
      if (e instanceof Error && SPECTATE_GONE.test(e.message)) throw new Error(SPECTATE_GONE_MESSAGE);
      throw e;
    }
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
    // They invited you first (both tapped Invite at once): take that seat, or
    // each of you would sit alone in your own room.
    const theirs = inviteFrom(friend, friends.state?.invites ?? []);
    if (theirs) {
      joinInvite(theirs);
      return;
    }
    if (!selectedDeck) {
      setFriendError("Select a deck first.");
      return;
    }
    const launch = {
      status: `Inviting ${friend.username}…`,
      leaderId: selectedDeck.leaderId,
      invite: true,
      friends: friendsEnabled,
    };
    runFriendAction(launch, async (gen) => {
      const opts = await authOpts();
      const wire = deckToWire(await freshDeck(selectedDeck));
      await connect({
        ...opts,
        preferredSeat: 0,
        deck: wire,
        createOptions: { ranked: false, players: [wire, wire], timer: {} },
      }, gen);
      const roomId = client.roomId;
      // The room is open either way; a failed invite must not strand the host
      // in the lobby while their room sits connected in the background.
      if (roomId) await inviteFriend(friend.user_id, roomId, client.serverUrl).catch(() => undefined);
    });
  }

  function joinInvite(invite: FriendInvite) {
    if (!selectedDeck) {
      setFriendError("Select a deck first.");
      return;
    }
    const launch = { status: `Joining ${invite.from_username}…`, leaderId: selectedDeck.leaderId, invite: false };
    runFriendAction(launch, async (gen) => {
      const opts = await authOpts();
      try {
        await connect({
          ...opts,
          serverUrl: roomServerUrl(opts.serverUrl, invite.server_url),
          roomId: invite.room_id,
          deck: deckToWire(await freshDeck(selectedDeck)),
        }, gen);
      } catch (e) {
        // A cancelled join never reached the room: keep the invite.
        if (e instanceof LaunchCancelledError) throw e;
        void dismissInvite(invite.id).finally(() => void friends.refresh());
        throw new Error(`${invite.from_username}'s room is no longer open.`);
      }
      void dismissInvite(invite.id);
    });
  }

  function spectateFriend(friend: Friend) {
    if (!friend.room_id) return;
    const roomId = friend.room_id;
    runFriendAction({ status: `Connecting to ${friend.username}'s match…`, leaderId: null, invite: false }, (gen) =>
      connectSpectator(roomId, gen, undefined, friend.server_url),
    );
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
    setBotDeckId((prev) => (prev !== BOT_DECK_MIRROR && !all.some((d) => d.id === prev) ? BOT_DECK_MIRROR : prev));
    setOpponentDeckId((prev) => {
      if (prev && all.some((d) => d.id === prev)) return prev;
      // Prefer a different constructed deck for the enemy when available.
      const other = all.find((d) => d.id !== sel.id) ?? sel;
      return other.id;
    });
  }

  const syncedDecks = useSavedDecksVersion();
  useEffect(() => {
    if (syncedDecks > 0) refreshDecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncedDecks]);

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
    warmDuelServices(getApiBaseUrl(), rememberedGameServerUrl() ?? serverUrl);
    void fetchAuthMe()
      .then((u) => {
        if (u) {
          setAuthUser(u);
          // Fills the top bar's Bounty and the Your voyage card without minting a token.
          void fetchRatingMe()
            .then((r) => {
              setMe(r);
              if (r) setBounty(r.rating);
            })
            .catch(() => setMe(null));
        }
        // Signed in but never picked a username (e.g. closed the tab mid-setup).
        // A spectate link works without one.
        if (needsUsername(u) && !watchRoomId) navigate("/welcome/username", { replace: true });
      })
      .catch(() => undefined)
      .finally(() => setAuthChecked(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Spectate link: wait for sign-in to settle (account token vs guest token), then
  // reuse the spectate flow. `replace` so Back doesn't land on the link and re-join.
  useEffect(() => {
    if (!watchRoomId || !authChecked || watchStarted.current) return;
    watchStarted.current = true;
    runFriendAction(
      { status: "Connecting to the match…", leaderId: null, invite: false },
      (gen) => connectSpectator(watchRoomId, gen, watchSeat),
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchRoomId, authChecked]);

  const selectedDeck = useMemo(
    () => decks.find((d) => d.id === selectedId) ?? null,
    [decks, selectedId],
  );

  /**
   * Join tapped on the waiting board: that room is already left; take the seat
   * once sign-in (for the game token) and the deck are known.
   */
  const handoffInvite = useRef((location.state as { joinInvite?: FriendInvite } | null)?.joinInvite ?? null);
  useEffect(() => {
    const invite = handoffInvite.current;
    if (!invite || !friendsEnabled || !selectedDeck) return;
    handoffInvite.current = null;
    // Back from the match must not land here and join again.
    navigate("/", { replace: true, state: null });
    joinInvite(invite);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friendsEnabled, selectedDeck]);

  function chooseDeck(id: string) {
    setSelectedId(id);
    setSelectedDeckId(id);
  }

  /** The sheet at the mode chooser, or straight at one mode. */
  function openSheet(at: PlayMode | null = null) {
    setError(null);
    setMode(null);
    if (at) pickMode(at);
    setSheetOpen(true);
  }

  /** Play button or a mode tile: Ranked starts the queue at once, the rest open their setup. */
  function playFrom(at: LastMode | null) {
    const action = primaryAction(at);
    if (action.act === "start") {
      // Anything that would fail on the spot is shown in the sheet, which has room for the message.
      if (!selectedDeck || (authMode === "dev" && !settings.devUserKey.trim())) {
        openSheet(action.mode);
        return;
      }
      void confirmSetup(action.mode);
      return;
    }
    openSheet(action.mode);
  }

  function dismissIntro() {
    markIntroDone();
    setIntroClosed(true);
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
      return { serverUrl: gameServerUrlFor(minted, serverUrl), gameToken: minted.token };
    }
    if (authMode === "google") {
      const minted = await mintSessionGameToken();
      setRating(minted.rating);
      setBounty(minted.rating);
      return { serverUrl: gameServerUrlFor(minted, serverUrl), gameToken: minted.token };
    }
    const minted = await mintDevGameToken(settings.devUserKey.trim());
    setRating(minted.rating);
    setBounty(minted.rating);
    return { serverUrl: gameServerUrlFor(minted, serverUrl), gameToken: minted.token };
  }

  function hotseatUserKey(): string {
    if (authMode === "guest") return getOrCreateGuestId();
    if (authMode === "google" && authUser) return `user-${authUser.id}`;
    return settings.devUserKey.trim() || "web-dev";
  }

  async function confirmSetup(mode: PlayMode) {
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
    // Play repeats this mode next time; the how-it-works strip has done its job.
    writeLastMode(mode);
    setLastMode(readLastMode());
    markIntroDone();
    setIntroClosed(true);
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
        warmDuelServices(getApiBaseUrl(), rememberedGameServerUrl() ?? serverUrl);
        navigate("/hotseat", {
          state: {
            serverUrl,
            userKey: hotseatUserKey(),
            useToken: true,
            deckWire: wire,
            enemyDeckWire: deckToWire(enemy),
            deckName: selectedDeck!.name,
            enemyDeckName: enemy.name,
            owner: matchOwner,
          },
        });
        return;
      }
      // Online: open the board now and mint / queue / connect behind it, so
      // nobody waits on a Connecting… button (the queue alone can take minutes).
      const picked = selectedDeck!;
      const room = roomId.trim();
      const create = mode === "create";
      const vsBot = mode === "bot";
      const botDeck = vsBot ? resolveBotDeck(decks, picked, botDeckId) : null;
      startMatch(
        {
          status:
            mode === "queue"
              ? "Searching for an opponent…"
              : mode === "spectate"
                ? "Connecting to the match…"
                : vsBot
                  ? "Starting your game…"
                  : create
                    ? "Opening your room…"
                    : "Joining room…",
          leaderId: mode === "spectate" ? null : picked.leaderId,
          invite: create,
          friends: friendsEnabled,
        },
        async (gen) => {
          if (mode === "spectate") {
            await connectSpectator(room, gen);
            return;
          }
          const opts = await authOpts();
          const wire = deckToWire(await freshDeck(picked));
          if (mode === "queue") {
            await queueRanked({ ...opts, deck: wire }, gen);
            return;
          }
          await connect({
            ...opts,
            roomId: mode === "join" ? room : undefined,
            preferredSeat: create || vsBot ? 0 : undefined,
            deck: wire,
            createOptions: botDeck
              ? botCreateOptions(botLevel, botDeck)
              : create
                ? { ranked: false, players: [wire, wire], timer: timerFromPreset(timerPreset) }
                : undefined,
          }, gen);
        },
      );
      if (mode !== "spectate") setSelectedDeckId(picked.id);
      navigate("/duel");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connect failed");
      // A tile starts without the sheet open: show the error where it can be read.
      setMode(mode);
      setSheetOpen(true);
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
      : mode === "bot"
        ? "Play vs Bot"
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
      : mode === "bot"
        ? "Start game"
        : mode === "create"
        ? "Create room"
        : mode === "join"
          ? "Join room"
          : mode === "queue"
            ? "Find match"
            : "Watch";

  // A spectate link has no lobby to show: it opens the board as soon as sign-in settles.
  if (watchRoomId && !watchStarted.current && !friendError) {
    return (
      <div className="app-shell home-shell">
        <p className="muted" role="status" style={{ padding: "2rem 16px" }}>Opening the match…</p>
      </div>
    );
  }

  return (
    <div className="app-shell home-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="topbar-left">
            <NavMenu />
            <Link to="/" className="topbar-mark" aria-label="OPTCG Duel home">
              <BrandWordmark />
            </Link>
          </div>
          <div className="topbar-right">
            {authMode === "guest" ? (
              <a className="btn btn-primary btn-sm" href={googleLoginUrl()}>
                Sign in
              </a>
            ) : null}
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
              className="icon-btn topbar-in-menu"
              aria-label="Deck planner"
              title="Deck planner"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                <path
                  fill="currentColor"
                  d="M8 2h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm0 2v14h11V4H8Zm2 3h7v2h-7V7Zm0 4h7v2h-7v-2ZM3 6h1v16h13v1a1 1 0 0 1-1 1H4a2 2 0 0 1-2-2V7a1 1 0 0 1 1-1Z"
                />
              </svg>
              <span className="icon-btn-label">Planner</span>
            </a>
            <Link to="/history" className="icon-btn topbar-in-menu" aria-label="Match history" title="Match history">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                <path
                  fill="currentColor"
                  d="M13 3a9 9 0 0 0-9 9H1l3.9 3.9.07.14L9 12H6a7 7 0 1 1 2.05 4.95l-1.42 1.42A9 9 0 1 0 13 3Zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12Z"
                />
              </svg>
              <span className="icon-btn-label">History</span>
            </Link>
            <Link to="/settings" className="icon-btn" aria-label="Settings" title="Settings">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                <path
                  fill="currentColor"
                  d="M19.14 12.94a7.6 7.6 0 0 0 .06-.94 7.6 7.6 0 0 0-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.3 7.3 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.49.42l-.36 2.54c-.59.24-1.13.56-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.48a.5.5 0 0 0 .12.64l2.03 1.58a7.6 7.6 0 0 0 0 1.88L2.83 14.16a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.3.6.22l2.39-.96c.5.38 1.04.7 1.63.94l.36 2.54c.05.24.25.42.49.42h3.8c.24 0 .45-.18.49-.42l.36-2.54c.59-.24 1.13-.56 1.63-.94l2.39.96c.22.08.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"
                />
              </svg>
              <span className="icon-btn-label">Settings</span>
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

        <div className="home-primary">
          <UpdateNotice />

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

          {otherDevice ? (
            <section className="notice notice-gold" aria-label="Resume match from another device">
              <div className="notice-body">
                <strong>Match in progress on another device</strong>
                <span>
                  Your {activeMatchModeLabel(otherDevice)} match is still running. Resume it here
                  to take over your seat.
                </span>
              </div>
              <div className="notice-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => resumeOnThisDevice(otherDevice)}
                >
                  Resume match
                </button>
              </div>
            </section>
          ) : null}

          {queueing ? (
            <section className="notice" aria-live="polite">
              <div className="notice-body">
                <strong>Searching for an opponent…</strong>
                <span>Ranked queue · 15 minutes per player</span>
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

          {selectedDeck ? (
            <DeckSwitcher decks={decks} selectedDeck={selectedDeck} onChoose={chooseDeck} />
          ) : null}

          <div className="home-actions">
            <button
              type="button"
              className="btn btn-play"
              disabled={busy || queueing}
              aria-describedby="play-subline"
              onClick={() => playFrom(lastMode)}
            >
              Play
              <span id="play-subline" className="btn-play-sub" aria-hidden>
                {primaryAction(lastMode).subline}
              </span>
            </button>
            <div className={`mode-tiles mode-tiles-${modeTiles(lastMode).length}`}>
              {modeTiles(lastMode).map((m) => {
                const card = MODE_CARDS.find((c) => c.mode === m)!;
                return (
                  <button
                    key={m}
                    type="button"
                    className="mode-tile"
                    disabled={busy || queueing}
                    onClick={() => playFrom(m)}
                  >
                    <span className="mode-tile-title">{card.title}</span>
                    <span className="mode-tile-blurb">{card.short}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <OnlyOnDuel deck={selectedDeck} onSpectate={() => playFrom("spectate")} disabled={busy || queueing} />

          {showIosHint ? (
            <div className="install-hint" role="note" aria-label="Install on your iPhone">
              <span>
                <strong>Install:</strong> tap Share, then Add to Home Screen.
              </span>
              <button
                type="button"
                className="install-hint-close"
                aria-label="Dismiss install tip"
                onClick={() => {
                  dismissIosHint(readInstallEnv());
                  setShowIosHint(false);
                }}
              >
                ✕
              </button>
            </div>
          ) : null}

          {authChecked && introVisible(authMode, introClosed) ? <IntroStrip onDismiss={dismissIntro} /> : null}
        </div>

        <div className="home-side">
          <EventBanner />
          {friendError ? <p className="error-text">{friendError}</p> : null}
          {busy && busyStatus && !sheetOpen ? <p className="friends-note">{busyStatus}</p> : null}
          <LogPoseTile deck={selectedDeck} />
          {authMode === "google" ? <VoyageCard me={me} /> : null}
          <FriendsPanel
            signedIn={friendsEnabled}
            state={friends.state}
            loadError={friends.loadError}
            refresh={friends.refresh}
            busy={busy || queueing}
            onInvite={inviteToPrivateRoom}
            onSpectate={spectateFriend}
          />
          <TopBounties me={authMode === "google" ? me : null} />
          <LiveLine />
        </div>
        <div className="home-version">
          <VersionStatus />
        </div>
      </main>

      {sheetOpen ? (
        <Dialog
          open
          onClose={() => {
            if (!busy) closeSheet();
          }}
          className="sheet-backdrop"
          panelClassName="sheet"
          label={modeTitle}
        >
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
                <TabGroup selectedIndex={mode === "join" ? 1 : 0} onChange={(i) => pickMode(i === 1 ? "join" : "create")}>
                  <TabList className="segmented" aria-label="Private room">
                    <Tab className={({ selected }) => (selected ? "active" : "")}>Create</Tab>
                    <Tab className={({ selected }) => (selected ? "active" : "")}>Join</Tab>
                  </TabList>
                </TabGroup>
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

              {mode === "bot" ? (
                <>
                  <div className="field">
                    <span className="field-label" id="bot-level-label">
                      Bot level
                    </span>
                    <div className="segmented segmented-3" role="radiogroup" aria-labelledby="bot-level-label">
                      {BOT_LEVELS.map((l) => (
                        <button
                          key={l.level}
                          type="button"
                          role="radio"
                          aria-checked={botLevel === l.level}
                          className={botLevel === l.level ? "active" : ""}
                          onClick={() => setBotLevel(l.level)}
                        >
                          {l.label}
                        </button>
                      ))}
                    </div>
                    <p className="field-hint">{BOT_LEVELS.find((l) => l.level === botLevel)?.hint}</p>
                  </div>
                  <DeckPicker
                    id="bot-deck"
                    label="Bot's deck"
                    decks={decks}
                    value={botDeckId}
                    onChange={setBotDeckId}
                    mirror={{ label: "Same as your deck", deck: selectedDeck }}
                  />
                  <p className="field-hint">
                    A casual game against the computer: not ranked, no timer, and not saved to your match history.
                  </p>
                </>
              ) : null}

              {mode === "create" ? (
                <div className="field">
                  <label htmlFor="timer-preset">Timer</label>
                  <Select<TimerPreset>
                    id="timer-preset"
                    value={timerPreset}
                    onChange={setTimerPreset}
                    options={[
                      { value: "off", label: "No timer" },
                      { value: "turn_30", label: "30 second turns" },
                      { value: "seat_15m", label: "15 minutes per player" },
                      { value: "turn_30_seat_15m", label: "30s turns + 15 min per player" },
                    ]}
                  />
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
                  Ranked games give each player 15 minutes on a chess clock. Your Bounty updates after the match.
                </p>
              ) : null}

              {error ? <p className="error-text">{error}</p> : null}

              <button
                type="button"
                className="btn btn-primary btn-lg sheet-confirm"
                disabled={busy || queueing}
                onClick={() => void confirmSetup(mode)}
              >
                {busy && busyStatus ? busyStatus : confirmLabel}
              </button>
            </div>
          )}
        </Dialog>
      ) : null}
      <WhatsNewCard app="duel" Link={Link} />
    </div>
  );
}
