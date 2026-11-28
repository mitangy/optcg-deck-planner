import { Dialog, DialogTitle } from "@optcg/ui/popups";
import { useFriends } from "../../friends/FriendsPanel";
import { findRematchFriend, GAME_LOST_BODY, GAME_LOST_TITLE, type RematchPlan } from "../../state/connectionLoss";

/** Floats over the board (fixed, click-through) so showing it never moves the playmat. */
export function ReconnectingPill() {
  return (
    <div className="reconnect-pill" role="status" data-testid="reconnecting-pill">
      <span className="reconnect-pill-dot" aria-hidden />
      Reconnecting…
    </div>
  );
}

const noop = () => {};

/**
 * The room is gone: the server restarted. A bot game starts again with the same decks; a game against a friend
 * invites them; anyone else has no one-tap way back, so only Back to home is left.
 */
export function GameLostOverlay({
  plan,
  onRematch,
  onHome,
}: {
  plan: RematchPlan | null;
  onRematch: () => void;
  onHome: () => void;
}) {
  const asksFriend = Boolean(plan && !plan.bot && plan.opponentName);
  const friends = useFriends(asksFriend);
  const canRematch = Boolean(plan?.bot) || findRematchFriend(plan, friends.state?.friends) !== null;
  return (
    <Dialog open onClose={noop} role="alertdialog" className="moved-overlay" panelClassName="moved-card game-lost-card">
      <DialogTitle as="h2">{GAME_LOST_TITLE}</DialogTitle>
      <p>{GAME_LOST_BODY}</p>
      <div className="moved-actions">
        <button type="button" className="btn btn-primary" disabled={!canRematch} onClick={onRematch}>
          Rematch
        </button>
        <button type="button" className="btn btn-secondary" onClick={onHome}>
          Back to home
        </button>
      </div>
    </Dialog>
  );
}
