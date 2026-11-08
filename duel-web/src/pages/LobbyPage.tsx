import { Suspense, useEffect, useState } from "react";
import { WarningNotice } from "../warnings/WarningNotice";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { getApiBaseUrl, getGameServerUrl } from "../config";
import { warmDuelServices } from "../net/api";
import { rememberedGameServerUrl } from "../net/gameServer";
import { clearMatchResume, loadMatchResume } from "../net/matchResume";
import { useDuelSession } from "../state/DuelSession";
import { FriendInvites, FriendsPanel, useFriends } from "../friends/FriendsPanel";
import { dismissIosHint, readInstallEnv, shouldShowIosInstallHint } from "../installPrompt";
import { UpdateNotice, VersionStatus } from "../VersionStatus";
import { EventBanner } from "../events/EventBanner";
import { IntroStrip } from "../home/IntroStrip";
import { LivePanel } from "../home/LivePanel";
import { LogPoseTile } from "../home/LogPoseTile";
import { OnlyOnDuel } from "../home/OnlyOnDuel";
import { BrandMark } from "../BrandMark";
import { TopBounties } from "../home/TopBounties";
import { VoyageCard } from "../home/VoyageCard";
import { introDone, introVisible, markIntroDone } from "../home/intro";
import { readLastMode, writeLastMode, type LastMode } from "../home/lastMode";
import { primaryAction } from "../home/primaryAction";
import { TournamentsCard } from "../tournaments/TournamentsCard";
import { prefetchBoardWhenIdle, WhatsNewHost } from "../lazyRoutes";
import { DeckSwitcher } from "./lobby/DeckSwitcher";
import { LobbyTopbar } from "./lobby/LobbyTopbar";
import type { PlayMode } from "./lobby/modes";
import { PlayActions } from "./lobby/PlayActions";
import { PlaySheet } from "./lobby/PlaySheet";
import { ResumeNotices } from "./lobby/ResumeNotices";
import { useLobbyAuth } from "./lobby/useLobbyAuth";
import { useLobbyDecks } from "./lobby/useLobbyDecks";
import { useLobbySheet } from "./lobby/useLobbySheet";
import { SPECTATE_GONE_MESSAGE, useMatchLaunchers } from "./lobby/useMatchLaunchers";
import { useOtherDeviceMatch } from "./lobby/useOtherDeviceMatch";

// The home page's pieces live in ./lobby; these two names are what tests and other pages import from here.
export { DeckSwitcher, SPECTATE_GONE_MESSAGE };

export function LobbyPage() {
  const navigate = useNavigate();
  const { cancelQueue, queueing } = useDuelSession();
  // The board is its own chunk (B-01): fetch it once the lobby is up and the browser is idle, so Play opens it at once.
  useEffect(() => prefetchBoardWhenIdle(), []);
  // `/watch/:roomId` (a shared spectate link) goes straight into that match.
  const watchRoomId = useParams<{ roomId: string }>().roomId?.trim() || null;
  const [searchParams] = useSearchParams();
  const watchSeat = searchParams.get("seat") === "2" ? 1 : 0;
  const serverUrl = getGameServerUrl();
  const auth = useLobbyAuth(watchRoomId);
  const { settings, authUser, authMode, authChecked, matchOwner, accountName, bounty, me } = auth;
  const [lastMode, setLastMode] = useState<LastMode | null>(() => readLastMode());
  const [introClosed, setIntroClosed] = useState(() => introDone());
  const [pendingResume, setPendingResume] = useState<ReturnType<typeof loadMatchResume>>(null);
  const [showIosHint, setShowIosHint] = useState(() => shouldShowIosInstallHint(readInstallEnv()));

  const deckState = useLobbyDecks();
  const { decks, selectedDeck } = deckState;
  const sheet = useLobbySheet();
  const otherDevice = useOtherDeviceMatch({ authChecked, matchOwner, devUserKey: settings.devUserKey, serverUrl });
  const friendsEnabled = authMode === "google" && Boolean(authUser?.username);
  const friends = useFriends(friendsEnabled);

  useEffect(() => {
    // Offer resume instead of forcing it — browser Back from hotseat used to
    // bounce straight back into the match and made Leave feel broken.
    setPendingResume(loadMatchResume());
    // Invite link (`/?join=<room id>`): open the Join form with the id filled in.
    const inviteRoom = new URLSearchParams(window.location.search).get("join")?.trim();
    if (inviteRoom) {
      sheet.setRoomId(inviteRoom);
      sheet.setMode("join");
      sheet.setSheetOpen(true);
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }
    // Wake free-tier Render API + game-server so hotseat mint/create is warm.
    warmDuelServices(getApiBaseUrl(), rememberedGameServerUrl() ?? serverUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const launch = useMatchLaunchers({
    auth,
    decks: deckState,
    sheet,
    friends,
    friendsEnabled,
    watch: { roomId: watchRoomId, seat: watchSeat },
    onModeStarted: (mode) => {
      // Play repeats this mode next time; the how-it-works strip has done its job.
      writeLastMode(mode);
      setLastMode(readLastMode());
      markIntroDone();
      setIntroClosed(true);
    },
  });
  const { busy, busyStatus, friendError, watchStarted, confirmSetup } = launch;

  /** Play button or a mode tile: Ranked starts the queue at once, the rest open their setup. */
  function playFrom(at: LastMode | null) {
    const action = primaryAction(at);
    if (action.act === "start") {
      // Anything that would fail on the spot is shown in the sheet, which has room for the message.
      if (!selectedDeck || (authMode === "dev" && !settings.devUserKey.trim())) {
        sheet.openSheet(action.mode);
        return;
      }
      void confirmSetup(action.mode);
      return;
    }
    sheet.openSheet(action.mode);
  }

  function dismissIntro() {
    markIntroDone();
    setIntroClosed(true);
  }

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
      <WarningNotice signedIn={authUser != null} />
      <LobbyTopbar authMode={authMode} accountName={accountName} bounty={bounty} />

      <main className="home">
        <div className="home-hero">
          <p className="home-kicker">One Piece Card Game</p>
          <h1 className="home-brand">
            <BrandMark className="home-brand-mark" />
            OPTCG Duel
          </h1>
          <div className="home-rule" aria-hidden>
            <span />
          </div>
        </div>

        <div className="home-primary">
          <UpdateNotice />

          <ResumeNotices
            pendingResume={pendingResume}
            onResume={() => navigate(pendingResume?.mode === "hotseat" ? "/hotseat" : "/duel", { replace: true })}
            onDiscard={() => {
              clearMatchResume();
              setPendingResume(null);
            }}
            otherDevice={otherDevice}
            onResumeOtherDevice={launch.resumeOnThisDevice}
            queueing={queueing}
            onCancelQueue={() => void cancelQueue()}
          />

          {friends.state ? (
            <FriendInvites
              invites={friends.state.invites}
              busy={busy || queueing}
              onJoin={launch.joinInvite}
              onDismissed={() => void friends.refresh()}
            />
          ) : null}

          {selectedDeck ? (
            <DeckSwitcher decks={decks} selectedDeck={selectedDeck} onChoose={deckState.chooseDeck} />
          ) : null}

          <PlayActions lastMode={lastMode} disabled={busy || queueing} onPlay={playFrom} />

          <LivePanel
            onInvite={() => playFrom("create")}
            onBot={() => playFrom("bot")}
            onPractice={() => playFrom("hotseat")}
            disabled={busy || queueing}
          />

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
          {busy && busyStatus && !sheet.sheetOpen ? <p className="friends-note">{busyStatus}</p> : null}
          <LogPoseTile deck={selectedDeck} />
          {authMode === "google" ? <VoyageCard me={me} /> : null}
          <TournamentsCard signedIn={friendsEnabled} />
          <FriendsPanel
            signedIn={friendsEnabled}
            state={friends.state}
            loadError={friends.loadError}
            refresh={friends.refresh}
            busy={busy || queueing}
            onInvite={launch.inviteToPrivateRoom}
            onSpectate={launch.spectateFriend}
          />
          <TopBounties me={authMode === "google" ? me : null} />
        </div>
        <div className="home-version">
          <VersionStatus />
        </div>
      </main>

      <PlaySheet
        sheet={sheet}
        deckState={deckState}
        chooseDeck={deckState.chooseDeck}
        busy={busy}
        busyStatus={busyStatus}
        queueing={queueing}
        onConfirm={(mode: PlayMode) => void confirmSetup(mode)}
      />
      {/* Fixed to the corner, so it takes no room while its chunk loads. */}
      <Suspense fallback={null}>
        <WhatsNewHost />
      </Suspense>
    </div>
  );
}
