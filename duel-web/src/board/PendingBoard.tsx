import type { CardView } from "../net/protocol";
import { FriendInvites } from "../friends/FriendsPanel";
import type { FriendInvite } from "../friends/friendsApi";
import { useCardBackUrl } from "../cardBack";
import { usePlaymatUrl } from "../playmat";
import { useDuelSettings } from "../settings";
import { RoomInvite } from "./RoomShare";
import { SideField } from "./SideField";
import {
  LANDSCAPE_PHONE_QUERY,
  PORTRAIT_MAT_QUERY,
  useMediaQuery,
  WIDE_BOARD_QUERY,
} from "./useMediaQuery";

/** What the board shows before the match's first view arrives. */
export type BoardWaiting = {
  /** "Searching for an opponent…", "Connecting…", "Starting practice…" */
  status: string;
  /** Your deck's Leader, when known. Omitted = an empty Leader slot. */
  youLeaderId?: string | null;
  /** The opponent's Leader (practice only). Omitted = an empty Leader slot. */
  oppLeaderId?: string | null;
  /** Private room: show its invite card once the room exists. */
  invite?: { roomId: string | null; autoCopy: boolean } | null;
  /** Invites friends sent you while you wait; Join leaves this room for theirs. */
  friendInvites?: {
    invites: FriendInvite[];
    onJoin: (invite: FriendInvite) => void;
    onDismissed: () => void;
  } | null;
};

type Props = {
  waiting: BoardWaiting;
  errorBanner: string | null;
  leaveLabel: string;
  onLeave: () => void;
  onClearError: () => void;
};

function leaderCard(id: string, defId: string | null | undefined): CardView {
  return { id, defId: defId ?? "" };
}

/** Empty board sides: 50-card decks, 10 DON!!, nothing in play yet. */
function emptySide(id: string, leaderId: string | null | undefined) {
  return {
    leader: leaderCard(id, leaderId),
    characters: [],
    stage: null,
    deckCount: 50,
    trash: [],
    lifeCount: 0,
    donDeckCount: 10,
    costArea: [],
    costAreaCount: 0,
    activeDonCount: 0,
  };
}

/**
 * The playmat with both Leaders and empty zones, shown the moment a match is
 * requested so queueing / connecting happens on the board instead of on a
 * loading screen. Nothing here is interactive except Cancel.
 */
export function PendingBoard({ waiting, errorBanner, leaveLabel, onLeave, onClearError }: Props) {
  const prefs = useDuelSettings();
  const wide = useMediaQuery(WIDE_BOARD_QUERY);
  const portraitMat = useMediaQuery(PORTRAIT_MAT_QUERY);
  const landscapePhone = useMediaQuery(LANDSCAPE_PHONE_QUERY);
  const lp = wide && landscapePhone;
  const playmatUrl = usePlaymatUrl();
  const cardBackUrl = useCardBackUrl();
  const invite = waiting.invite;

  return (
    <div
      className={`board-root arena arena-pending${wide ? " arena-wide" : ""}${lp ? " arena-lp" : ""}`}
      data-phase="waiting"
      aria-busy="true"
    >
      <header className="hud-bar">
        <div className="hud-brand">OPTCG DUEL</div>
        <div className="hud-status" role="status" aria-live="polite">
          <span className="pending-spinner" aria-hidden />
          <span className="hud-phase">{waiting.status}</span>
        </div>
        <div className="hud-actions">
          <button type="button" className="leave-btn" onClick={onLeave}>
            {leaveLabel}
          </button>
        </div>
      </header>
      {errorBanner ? (
        <button type="button" className="error-banner" onClick={onClearError}>
          {errorBanner}
        </button>
      ) : null}
      <div className="arena-body">
        {wide && !lp ? <aside className="arena-left" aria-hidden /> : null}
        <div className="playmat">
          <div className="playmat-inner">
            <SideField
              side="opp"
              compact
              countRow={portraitMat}
              cardBackUrl={cardBackUrl}
              matDim={prefs.playmatDim}
              matOpacity={prefs.playmatOpacity}
              data={emptySide("pending-opp-leader", waiting.oppLeaderId)}
            />
            <div className="midline">
              <div className="prompt pending-prompt" title={waiting.status}>
                {waiting.status}
              </div>
            </div>
            <SideField
              side="you"
              matImageUrl={playmatUrl}
              matDim={prefs.playmatDim}
              matOpacity={prefs.playmatOpacity}
              cardBackUrl={cardBackUrl}
              data={emptySide("pending-you-leader", waiting.youLeaderId)}
            />
          </div>
          {invite || waiting.friendInvites ? (
            <div className="pending-invite">
              <div className="pending-invite-stack">
                {waiting.friendInvites ? (
                  <div className="pending-invite-incoming">
                    <FriendInvites
                      invites={waiting.friendInvites.invites}
                      busy={false}
                      onJoin={waiting.friendInvites.onJoin}
                      onDismissed={waiting.friendInvites.onDismissed}
                      hint="Leaves your room and joins theirs"
                    />
                  </div>
                ) : null}
                {invite ? <RoomInvite roomId={invite.roomId} autoCopy={invite.autoCopy} /> : null}
              </div>
            </div>
          ) : null}
        </div>
        {wide && !lp ? <div className="arena-rail" aria-hidden /> : null}
      </div>
    </div>
  );
}
