import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { gameEvents } from "../../analytics/events";
import { getOrCreateGuestId } from "../../auth/guestId";
import { roomInviteUrl } from "../../board/input/clipboard";
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
import { isOwnRoom, JOIN_FAILED_MESSAGE, JOIN_TIMEOUT_MS, pickInviteDeck, stashJoinFallback, withTimeout } from "../../net/joinLinks";
import { clearMatchResume, loadMatchResume } from "../../net/matchResume";
import { LaunchCancelledError, useDuelSession, type MatchLaunch } from "../../state/DuelSession";
import { claimMatchRoom, tournamentCreateOptions } from "../../tournaments/playLoop";
import { clearActiveTournamentMatch, setActiveTournamentMatch } from "../../tournaments/activeTournamentMatch";
import { playTournamentMatch } from "../../tournaments/tournamentApi";
import type { useFriends } from "../../friends/FriendsPanel";
import { readLobbyHandoff, useLobbyHandoffs, type TournamentPlay } from "./lobbyHandoff";
import type { PlayMode } from "./modes";
import type { LobbyDecks } from "./useLobbyDecks";
import type { useLobbyAuth } from "./useLobbyAuth";
import type { LobbySheet } from "./useLobbySheet";

const GAME_MODE = { queue: "ranked", bot: "bot", hotseat: "practice", create: "friend", join: "friend" } as const;
const SPECTATE_GONE = /not found|locked/i;
// Back from the match must not land on a join link and sit down again.
const REPLACE_HISTORY = { replace: true };
export const SPECTATE_GONE_MESSAGE = "That match has ended or the spectate link is wrong.";

export function useMatchLaunchers(deps: {
  auth: ReturnType<typeof useLobbyAuth>;
  decks: LobbyDecks;
  sheet: LobbySheet;
  friends: ReturnType<typeof useFriends>;
  friendsEnabled: boolean;
  watch: { roomId: string | null; seat: 0 | 1 };
  joinRoomId?: string | null;
  onModeStarted: (mode: PlayMode) => void;
}) {
  const { auth, decks, sheet, friends, friendsEnabled, watch, joinRoomId = null, onModeStarted } = deps;
  const { settings, authUser, authMode, authChecked, matchOwner, setBounty } = auth;
  const { selectedDeck } = decks;
  const navigate = useNavigate();
  const location = useLocation();
  const { client, connect, queueRanked, setRating, startMatch, takeOver } = useDuelSession();
  const serverUrl = getGameServerUrl();
  const [busy, setBusy] = useState(false);
  const [busyStatus, setBusyStatus] = useState<string | null>(null);
  const [friendError, setFriendError] = useState<string | null>(() => readLobbyHandoff(location.state).matchError ?? null);
  const watchStarted = useRef(false);
  const joinStarted = useRef(false);
  const [ownRoomLink, setOwnRoomLink] = useState<string | null>(null);

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

  function runFriendAction(
    launch: MatchLaunch,
    fn: (launchGen: number) => Promise<void>,
    navOpts?: { replace?: boolean },
    mode = "friend",
  ) {
    if (authMode === "dev" && !settings.devUserKey.trim()) {
      setFriendError("Set a dev user key in Settings first.");
      return;
    }
    setFriendError(null);
    clearMatchResume();
    clearActiveTournamentMatch();
    if (launch.leaderId) gameEvents.stash(mode);
    startMatch(launch, fn);
    navigate("/duel", navOpts);
  }

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

  async function freshDeck(d: SavedDeck): Promise<SavedDeck> {
    if (!d.plannerDeckId) return d;
    const fresh = await refreshLinkedDeck(d, 4000);
    if (fresh !== d) decks.refreshDecks();
    return fresh;
  }

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
      deckId: selectedDeck.id,
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
      if (roomId) await inviteFriend(friend.user_id, roomId, client.serverUrl).catch(() => undefined);
    });
  }

  function joinInvite(invite: FriendInvite) {
    if (!selectedDeck) {
      setFriendError("Select a deck first.");
      return;
    }
    const launch = { status: `Joining ${invite.from_username}…`, leaderId: selectedDeck.leaderId, deckId: selectedDeck.id, invite: false };
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
        if (e instanceof LaunchCancelledError) throw e;
        void dismissInvite(invite.id).finally(() => void friends.refresh());
        throw new Error(`${invite.from_username}'s room is no longer open.`);
      }
      void dismissInvite(invite.id);
    });
  }

  function launchTournamentMatch(tp: TournamentPlay) {
    if (!selectedDeck) {
      setFriendError("Select a deck first.");
      return;
    }
    const launch = { status: `Playing ${tp.opponent}…`, leaderId: selectedDeck.leaderId, deckId: selectedDeck.id, invite: false };
    runFriendAction(launch, async (gen) => {
      const claim = await claimMatchRoom(
        () => playTournamentMatch(tp.code, tp.matchId),
        (ms) => new Promise((r) => setTimeout(r, ms)),
      );
      const opts = await authOpts();
      const wire = deckToWire(await freshDeck(selectedDeck));
      if (claim.action === "join") {
        await connect({ ...opts, serverUrl: roomServerUrl(opts.serverUrl, claim.server_url), roomId: claim.room_id, deck: wire }, gen);
        setActiveTournamentMatch({ code: tp.code, matchId: tp.matchId, roomId: claim.room_id });
        return;
      }
      await connect({
        ...opts,
        preferredSeat: 0,
        deck: wire,
        createOptions: tournamentCreateOptions(wire, timerFromPreset(tp.timer), claim.ticket),
      }, gen);
      if (client.roomId) {
        setActiveTournamentMatch({ code: tp.code, matchId: tp.matchId, roomId: client.roomId });
        await playTournamentMatch(tp.code, tp.matchId, { room_id: client.roomId, server_url: client.serverUrl }).catch(() => undefined);
      }
    }, undefined, "tournament");
  }

  function spectateFriend(friend: Friend) {
    if (!friend.room_id) return;
    const roomId = friend.room_id;
    runFriendAction({ status: `Connecting to ${friend.username}'s match…`, leaderId: null, deckId: null, invite: false, friends: friendsEnabled }, (gen) =>
      connectSpectator(roomId, gen, undefined, friend.server_url),
    );
  }

  // Spectate link: wait for sign-in to settle (account token vs guest token), then
  // reuse the spectate flow. `replace` so Back doesn't land on the link and re-join.
  useEffect(() => {
    if (!watch.roomId || !authChecked || watchStarted.current) return;
    watchStarted.current = true;
    runFriendAction(
      { status: "Connecting to the match…", leaderId: null, deckId: null, invite: false, friends: friendsEnabled },
      (gen) => connectSpectator(watch.roomId!, gen, watch.seat),
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch.roomId, authChecked]);

  // Join link: sit down in that room with the deck already selected. Waits for sign-in to settle (account vs guest token) and the deck list.
  useEffect(() => {
    if (!joinRoomId || !authChecked || !selectedDeck || joinStarted.current) return;
    joinStarted.current = true;
    if (isOwnRoom(joinRoomId)) {
      setOwnRoomLink(roomInviteUrl(joinRoomId));
      return;
    }
    if (loadMatchResume()) {
      // A match is still running here: joining would drop it. Let the player choose from the join sheet.
      stashJoinFallback(joinRoomId);
      navigate("/", REPLACE_HISTORY);
      return;
    }
    const deck = selectedDeck;
    runFriendAction(
      { status: "Joining the room…", leaderId: deck.leaderId, deckId: deck.id, invite: false, friends: friendsEnabled },
      async (gen) => {
        try {
          const opts = await authOpts();
          await withTimeout(connect({ ...opts, roomId: joinRoomId, deck: deckToWire(await freshDeck(deck)) }, gen), JOIN_TIMEOUT_MS, () =>
            void client.disconnect(true),
          );
        } catch (e) {
          if (e instanceof LaunchCancelledError) throw e;
          stashJoinFallback(joinRoomId);
          throw new Error(JOIN_FAILED_MESSAGE);
        }
      },
      REPLACE_HISTORY,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinRoomId, authChecked, selectedDeck]);

  // Match-over hub "Invite someone else": a fresh private room with the deck just played; the waiting room copies the join link.
  function openInviteRoom(playedDeckId: string | null) {
    const deck = pickInviteDeck(decks.decks, playedDeckId, selectedDeck);
    if (!deck) {
      setFriendError("Select a deck first.");
      return;
    }
    runFriendAction(
      { status: "Opening your room…", leaderId: deck.leaderId, deckId: deck.id, invite: true, inviteLink: true, friends: friendsEnabled },
      async (gen) => {
        const opts = await authOpts();
        const wire = deckToWire(await freshDeck(deck));
        await connect({ ...opts, preferredSeat: 0, deck: wire, createOptions: { ranked: false, players: [wire, wire], timer: {} } }, gen);
      },
    );
  }

  useLobbyHandoffs(friendsEnabled && selectedDeck !== null, { joinInvite, launchTournamentMatch, openInviteRoom }, authChecked && selectedDeck !== null);

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
    onModeStarted(mode);
    if (mode !== "spectate") gameEvents.stash(GAME_MODE[mode]);
    setBusy(true);
    setBusyStatus(mode === "hotseat" ? "Starting…" : "Connecting…");
    setError(null);
    try {
      clearMatchResume();
      clearActiveTournamentMatch();
      if (mode === "hotseat") {
        const wire = deckToWire(selectedDeck!);
        setSelectedDeckId(selectedDeck!.id);
        const enemy = savedDecks.find((d) => d.id === opponentDeckId) ?? selectedDeck!;
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
      const create = mode === "create";
      const vsBot = mode === "bot";
      const picked = vsBot && yourRandom ? (pickRandomDeck(savedDecks) ?? selectedDeck!) : selectedDeck!;
      const room = roomId.trim();
      const botDeck = vsBot ? resolveBotDeck(savedDecks, botDeckId) : null;
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
          deckId: mode === "spectate" ? null : picked.id,
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
    joinStarted,
    ownRoomLink,
    confirmSetup,
    resumeOnThisDevice,
    joinInvite,
    inviteToPrivateRoom,
    spectateFriend,
  };
}
