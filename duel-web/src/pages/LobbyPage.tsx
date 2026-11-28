import { Suspense, useEffect, useState } from "react";
import { WarningNotice } from "../warnings/WarningNotice";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { track } from "../analytics/events";
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
import { LivePanel, useLiveCounts } from "../home/LivePanel";
import { ForYou } from "../home/ForYou";
import { fetchMatchHistory } from "../history/historyApi";
import { useAsyncResource } from "../lib/useAsyncResource";
import { LogPoseTile } from "../home/LogPoseTile";
import { OnlyOnDuel } from "../home/OnlyOnDuel";
import { BrandMark } from "../BrandMark";
import { useMediaQuery } from "../lib/useMediaQuery";
import { RankedGate } from "./lobby/RankedGate";
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

export { DeckSwitcher, SPECTATE_GONE_MESSAGE };

const HISTORY_LIMIT = 10;

export function LobbyPage() {
  const navigate = useNavigate();
  const { cancelQueue, queueing } = useDuelSession();
  useEffect(() => prefetchBoardWhenIdle(), []);
  const watchRoomId = useParams<{ roomId: string }>().roomId?.trim() || null;
  useEffect(() => {
    // A spectate link opens the lobby too, but that visitor came for a match, not the home page.
    if (!watchRoomId) track("home_view");
  }, [watchRoomId]);
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
  const liveCounts = useLiveCounts();
  const historyRes = useAsyncResource(() => fetchMatchHistory(HISTORY_LIMIT), [authUser?.id], authUser != null);
  const games = authUser == null || historyRes.status === "loading" ? undefined : historyRes.status === "error" ? null : historyRes.data;

  useEffect(() => {
    // Offer resume instead of forcing it — browser Back from hotseat used to
    // bounce straight back into the match and made Leave feel broken.
    setPendingResume(loadMatchResume());
    const inviteRoom = new URLSearchParams(window.location.search).get("join")?.trim();
    if (inviteRoom) {
      sheet.setRoomId(inviteRoom);
      sheet.setMode("join");
      sheet.setSheetOpen(true);
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }
    if (new URLSearchParams(window.location.search).get("play") === "ranked") {
      sheet.openSheet("queue");
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }
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
      writeLastMode(mode);
      setLastMode(readLastMode());
      markIntroDone();
      setIntroClosed(true);
    },
  });
  const { busy, busyStatus, friendError, watchStarted, confirmSetup } = launch;

  const primary = primaryAction(lastMode, authMode === "google");
  const [rankedGate, setRankedGate] = useState(false);
  // Same breakpoint as the two-column home layout in uploads.css.
  const twoColumns = useMediaQuery("(min-width: 1000px) and (min-height: 500px)");
  const guestHome = authChecked && !authUser;
  const showIntro = authChecked && introVisible(authMode, introClosed);

  function playFrom(mode: LastMode | "spectate", act: "start" | "sheet" = mode === "queue" ? "start" : "sheet") {
    // Ranked keeps a Bounty and match history, which need an account (#1391).
    if (mode === "queue" && authMode === "guest") {
      setRankedGate(true);
      return;
    }
    if (act === "start") {
      if (!selectedDeck || (authMode === "dev" && !settings.devUserKey.trim())) {
        sheet.openSheet(mode);
        return;
      }
      void confirmSetup(mode);
      return;
    }
    sheet.openSheet(mode);
  }

  function dismissIntro() {
    markIntroDone();
    setIntroClosed(true);
  }

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
        <div className="home-hero" data-state={!authChecked ? "pending" : guestHome ? "guest" : "member"}>
          <p className="home-kicker">One Piece Card Game</p>
          <h1 className="home-brand">
            <BrandMark className="home-brand-mark" />
            OPTCG Duel
          </h1>
          <p className="home-tagline">Play the One Piece Card Game online. Free, in your browser.</p>
          <div className="home-rule" aria-hidden>
            <span />
          </div>
        </div>

        <div className="home-primary">
          <UpdateNotice />
          {/* Top of the play column so a phone sees why it landed here without scrolling (#1371). */}
          {friendError ? <p className="error-text lobby-error" role="alert">{friendError}</p> : null}

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

          <PlayActions primary={primary} disabled={busy || queueing} onPrimary={() => playFrom(primary.mode, primary.act)} onPlay={playFrom} />

          <LivePanel
            counts={liveCounts}
            onInvite={() => playFrom("create")}
            disabled={busy || queueing}
          />

          {authChecked && !authUser ? (
            <OnlyOnDuel deck={selectedDeck} />
          ) : null}
          {authUser ? <ForYou games={games} live={liveCounts} onSpectate={() => playFrom("spectate")} disabled={busy || queueing} /> : null}

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

          {showIntro && !twoColumns ? <IntroStrip onDismiss={dismissIntro} /> : null}
        </div>

        <div className="home-side">
          {/* Beside the play column on desktop so the right column is not just a list of cards (#1391). */}
          {showIntro && twoColumns ? <IntroStrip onDismiss={dismissIntro} /> : null}
          <EventBanner />
          {busy && busyStatus && !sheet.sheetOpen ? <p className="friends-note">{busyStatus}</p> : null}
          <LogPoseTile deck={selectedDeck} />
          {authMode === "google" ? <VoyageCard me={me} games={games} /> : null}
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
        onConfirm={(mode: PlayMode) => (mode === "queue" && authMode === "guest" ? setRankedGate(true) : void confirmSetup(mode))}
      />
      {rankedGate ? (
        <RankedGate
          onClose={() => setRankedGate(false)}
          onBot={() => {
            setRankedGate(false);
            playFrom("bot");
          }}
        />
      ) : null}
      <Suspense fallback={null}>
        <WhatsNewHost />
      </Suspense>
    </div>
  );
}
