import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getOrCreateGuestId } from "../../auth/guestId";
import { getApiBaseUrl, getGameServerUrl } from "../../config";
import { refreshLinkedDeck } from "../../decks/planner";
import { deckToWire, setSelectedDeckId, type SavedDeck } from "../../decks/storage";
import { dismissInvite, inviteFriend, inviteFrom, type Friend, type FriendInvite } from "../../friends/friendsApi";
import { botCreateOptions, pickRandomDeck, resolveBotDeck } from "../../home/botGame";
import { timerFromPreset } from "../../home/timerPreset";
import {
  mintDevGameToken,
  mintGuestGameToken,
  mintOwnerToken,
  mintSessionGameToken,
  warmDuelServices,
} from "../../net/api";
import { gameServerUrlFor, rememberedGameServerUrl, roomServerUrl } from "../../net/gameServer";
import type { ActiveMatch } from "../../net/activeMatches";
import { clearMatchResume } from "../../net/matchResume";
import { LaunchCancelledError, useDuelSession, type MatchLaunch } from "../../state/DuelSession";
import { claimMatchRoom } from "../../tournaments/playLoop";
import { playTournamentMatch } from "../../tournaments/tournamentApi";
import type { useFriends } from "../../friends/FriendsPanel";
import { readLobbyHandoff, useLobbyHandoffs, type TournamentPlay } from "./lobbyHandoff";
import type { PlayMode } from "./modes";
import type { LobbyDecks } from "./useLobbyDecks";
import type { useLobbyAuth } from "./useLobbyAuth";
import type { LobbySheet } from "./useLobbySheet";

const SPECTATE_GONE = /not found|locked/i;
export const SPECTATE_GONE_MESSAGE = "That match has ended or the spectate link is wrong.";

/**
 * Every way the lobby starts or joins a match: the Play sheet's modes, friend invites and spectating, a tournament
 * Play, a shared `/watch/:roomId` link, and taking a match over from another device. The board opens at once and
 * the token / connect work runs behind it, so a failure comes back to the lobby as `friendError`.
 */
export function useMatchLaunchers(deps: {
  auth: ReturnType<typeof useLobbyAuth>;
  decks: LobbyDecks;
  sheet: LobbySheet;
  friends: ReturnType<typeof useFriends>;
  friendsEnabled: boolean;
  /** The shared spectate link's room id and seat, when the lobby was opened at `/watch/:roomId`. */
  watch: { roomId: string | null; seat: 0 | 1 };
  /** A mode was started from the Play sheet or a tile: the lobby remembers it and retires the intro. */
  onModeStarted: (mode: PlayMode) => void;
}) {
  const { auth, decks, sheet, friends, friendsEnabled, watch, onModeStarted } = deps;
  const { settings, authUser, authMode, authChecked, matchOwner, setBounty } = auth;
  const { selectedDeck } = decks;
  const navigate = useNavigate();
  const location = useLocation();
  const { client, connect, queueRanked, setRating, startMatch, takeOver } = useDuelSession();
  const serverUrl = getGameServerUrl();
  const [busy, setBusy] = useState(false);
  /** Short status while buttons are disabled (vs-self warm/mint). */
  const [busyStatus, setBusyStatus] = useState<string | null>(null);
  /** Also carries why a match request failed after the board opened (DuelPage sends it back). */
  const [friendError, setFriendError] = useState<string | null>(() => readLobbyHandoff(location.state).matchError ?? null);
  const watchStarted = useRef(false);

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

  /** Online matches pick up the art the planner shows for a linked deck first; on any failure the local copy plays. */
  async function freshDeck(d: SavedDeck): Promise<SavedDeck> {
    if (!d.plannerDeckId) return d;
    const fresh = await refreshLinkedDeck(d, 4000);
    if (fresh !== d) decks.refreshDecks();
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

  /** Tournament Play: the API says whether to open the match room or take the seat in it. */
  function launchTournamentMatch(tp: TournamentPlay) {
    if (!selectedDeck) {
      setFriendError("Select a deck first.");
      return;
    }
    const launch = { status: `Playing ${tp.opponent}…`, leaderId: selectedDeck.leaderId, invite: false };
    runFriendAction(launch, async (gen) => {
      const claim = await claimMatchRoom(
        () => playTournamentMatch(tp.code, tp.matchId),
        (ms) => new Promise((r) => setTimeout(r, ms)),
      );
      const opts = await authOpts();
      const wire = deckToWire(await freshDeck(selectedDeck));
      if (claim.action === "join") {
        await connect({ ...opts, serverUrl: roomServerUrl(opts.serverUrl, claim.server_url), roomId: claim.room_id, deck: wire }, gen);
        return;
      }
      await connect({
        ...opts,
        preferredSeat: 0,
        deck: wire,
        createOptions: { ranked: false, players: [wire, wire], timer: timerFromPreset(tp.timer) },
      }, gen);
      // The room is open either way; the opponent finds it once this is reported.
      if (client.roomId) {
        await playTournamentMatch(tp.code, tp.matchId, { room_id: client.roomId, server_url: client.serverUrl }).catch(() => undefined);
      }
    });
  }

  function spectateFriend(friend: Friend) {
    if (!friend.room_id) return;
    const roomId = friend.room_id;
    runFriendAction({ status: `Connecting to ${friend.username}'s match…`, leaderId: null, invite: false }, (gen) =>
      connectSpectator(roomId, gen, undefined, friend.server_url),
    );
  }

  // Spectate link: wait for sign-in to settle (account token vs guest token), then
  // reuse the spectate flow. `replace` so Back doesn't land on the link and re-join.
  useEffect(() => {
    if (!watch.roomId || !authChecked || watchStarted.current) return;
    watchStarted.current = true;
    runFriendAction(
      { status: "Connecting to the match…", leaderId: null, invite: false },
      (gen) => connectSpectator(watch.roomId!, gen, watch.seat),
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch.roomId, authChecked]);

  useLobbyHandoffs(friendsEnabled && selectedDeck !== null, { joinInvite, launchTournamentMatch });

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
    const { setError, setMode, setSheetOpen, roomId, botLevel, yourRandom, timerPreset } = sheet;
    const { decks: savedDecks, opponentDeckId, botDeckId } = decks;
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
    onModeStarted(mode);
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
        const enemy = savedDecks.find((d) => d.id === opponentDeckId) ?? selectedDeck!;
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
      const create = mode === "create";
      const vsBot = mode === "bot";
      // Random in the bot sheet: the deck is drawn now, the saved choice (selectedId) stays as it was.
      const picked = vsBot && yourRandom ? (pickRandomDeck(savedDecks, null) ?? selectedDeck!) : selectedDeck!;
      const room = roomId.trim();
      const botDeck = vsBot ? resolveBotDeck(savedDecks, picked, botDeckId) : null;
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
      if (mode !== "spectate" && !(vsBot && yourRandom)) setSelectedDeckId(picked.id);
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

  return {
    busy,
    busyStatus,
    friendError,
    watchStarted,
    confirmSetup,
    resumeOnThisDevice,
    joinInvite,
    inviteToPrivateRoom,
    spectateFriend,
  };
}
