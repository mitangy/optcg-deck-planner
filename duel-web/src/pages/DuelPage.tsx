import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { DuelBoard } from "../board/DuelBoard";
import type { BoardWaiting } from "../board/PendingBoard";
import { MovedElsewhereOverlay } from "../board/match/MovedElsewhereOverlay";
import { BountyAmount } from "../Bounty";
import { FriendInvites, useFriends } from "../friends/FriendsPanel";
import { pollsInvitesInMatch, type FriendInvite } from "../friends/friendsApi";
import { rematchDeckOptions } from "../decks/rematchDecks";
import { setSelectedDeckId } from "../decks/storage";
import { fetchMatchDetail } from "../history/historyApi";
import { useDuelSession } from "../state/DuelSession";

/** The saved match, for the rating change and match log link on the match-over card. */
const loadMatchRecord = (matchId: string) => fetchMatchDetail(matchId).then((d) => d.match);

export function DuelPage() {
  const navigate = useNavigate();
  const {
    launch,
    launching,
    queueing,
    connected,
    takenOver,
    takeOver,
    canReconnect,
    resuming,
    reconnecting,
    view,
    players,
    seat,
    matchId,
    errorBanner,
    matchOver,
    rating,
    sendIntent,
    reconnect,
    concede,
    leave,
    clearError,
    role,
    ranked,
    firstSeatPickedBy,
    firstSeatDice,
    dice,
    sendDice,
    brief,
    vsBot,
    battleLog,
    timer,
    chat,
    sendChat,
    sendHandOrder,
    undo,
    sendUndo,
    awayUntil,
    seatSkins,
    rematch,
    sendRematch,
  } = useDuelSession();
  const deckOptions = useMemo(() => rematchDeckOptions(), []);


  const leftRef = useRef(false);
  useEffect(() => {
    // Once only: the navigation is a transition, so this page can re-render
    // (clearError below) before it unmounts and would redirect again without the note.
    if (leftRef.current) return;
    if (!connected && !view && !canReconnect && !matchId && !resuming && !launching) {
      leftRef.current = true;
      // A request that failed before the match opened: say why back in the lobby.
      navigate("/", { replace: true, state: errorBanner ? { matchError: errorBanner } : null });
      if (errorBanner) clearError();
    }
  }, [connected, view, canReconnect, matchId, resuming, launching, errorBanner, clearError, navigate]);

  // Alone in your own room, or watching: a friend's invite must still reach you here.
  const friends = useFriends(pollsInvitesInMatch({ launch, role, view, matchId }));
  function joinFriendRoom(invite: FriendInvite) {
    // Leave this room first; the lobby takes the seat in theirs (it has the
    // deck and sign-in) and must not bounce back here with no note.
    leftRef.current = true;
    void leave();
    navigate("/", { replace: true, state: { joinInvite: invite } });
  }

  // Until the first view arrives the board is already up, empty, saying what it waits on.
  const rolling = !view && !(launching && launch) && !resuming && Boolean(dice);
  const waiting: BoardWaiting | undefined = view
    ? undefined
    : launching && launch
      ? { status: queueing ? "Searching for an opponent…" : launch.status, youLeaderId: launch.leaderId }
      : resuming
        ? { status: "Reconnecting to match…" }
        : dice
          ? { status: "Rolling for turn order…", youLeaderId: launch?.leaderId, invite: null }
          : {
              status: role === "spectator" ? "Waiting for the match to start…" : "Waiting for opponent…",
              youLeaderId: launch?.leaderId,
              invite:
                launch?.invite !== false && role === "player"
                  ? { roomId: matchId, autoCopy: seat === 0 }
                  : null,
              friendInvites: friends.state?.invites.length
                ? { invites: friends.state.invites, onJoin: joinFriendRoom, onDismissed: () => void friends.refresh() }
                : null,
            };
  return (
    <div className="duel-root">
      {!connected && canReconnect && view ? (
        <div className="reconnect-banner" role="status">
          <span>{reconnecting ? "Reconnecting to the match…" : "Disconnected from the match."}</span>
          <button
            type="button"
            disabled={reconnecting}
            onClick={async () => {
              try {
                await reconnect();
              } catch {
                clearError();
              }
            }}
          >
            Reconnect
          </button>
        </div>
      ) : null}
      {rating != null && !(role === "spectator" || view?.spectator) ? <div className="rating-chip">
          Your Bounty: <BountyAmount amount={rating} />
        </div> : null}
      <DuelBoard
        view={view}
        seat={seat}
        matchId={matchId}
        errorBanner={errorBanner}
        matchOver={matchOver}
        players={players}
        timer={timer}
        spectator={role === "spectator" || Boolean(view?.spectator)}
        matchBrief={role === "player" ? { brief, ranked } : undefined}
        battleLog={battleLog}
        firstSeatPickedBy={firstSeatPickedBy}
        firstSeatDice={firstSeatDice}
        dicePhase={view || !dice ? undefined : { state: dice, onAction: sendDice }}
        vsHuman
        canReport={!vsBot}
        chat={{ lines: chat, onSend: sendChat }}
        onConcede={connected && role === "player" ? () => concede() : undefined}
        onHandOrder={connected && role === "player" ? sendHandOrder : undefined}
        undo={role === "player" ? { state: undo, onAction: sendUndo } : undefined}
        onSendIntent={takenOver ? () => undefined : sendIntent}
        rematch={
          role === "player"
            ? {
                state: rematch,
                deckOptions,
                onAction: (action, decks) => {
                  const deck = seat === 0 || seat === 1 ? decks?.[seat] : undefined;
                  sendRematch(action, deck);
                  // Remember the pick so the lobby defaults to it next time.
                  const picked = deck ? deckOptions.find((o) => o.wire === deck) : undefined;
                  if (picked) setSelectedDeckId(picked.id);
                },
              }
            : undefined
        }
        loadMatchRecord={role === "player" ? loadMatchRecord : undefined}
        seatSkins={seatSkins}
        opponentAwayUntil={seat === 0 || seat === 1 ? awayUntil[seat === 0 ? 1 : 0] : null}
        waiting={waiting}
        // Both Leaders are revealed once the dice roll starts, so a player who leaves then takes the loss.
        leaveLabel={view ? undefined : role === "player" && rolling ? "Leave (counts as a loss)" : "Cancel"}
        onLeave={() => {
          void leave();
          navigate("/", { replace: true });
        }}
        onClearError={clearError}
      />
      {role === "spectator" && view && friends.state?.invites.length ? createPortal(
        // On <body>: .duel-root is position:fixed (its own stacking layer), so inside it the card motion layer would paint over the invite.
        <div className="spectator-invites">
          <FriendInvites
            invites={friends.state.invites}
            busy={false}
            onJoin={joinFriendRoom}
            onDismissed={() => void friends.refresh()}
            hint="Leaves this game · your selected deck"
          />
        </div>,
        document.body,
      ) : null}
      {takenOver && matchId && (seat === 0 || seat === 1) ? (
        <MovedElsewhereOverlay
          onPlayHere={() => takeOver(matchId, seat)}
          onLeave={() => {
            void leave();
            navigate("/", { replace: true });
          }}
        />
      ) : null}
    </div>
  );
}
