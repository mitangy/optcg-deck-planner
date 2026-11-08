import type { ActiveMatch } from "../../net/activeMatches";
import { activeMatchModeLabel } from "../../net/activeMatches";
import type { loadMatchResume } from "../../net/matchResume";

/**
 * The notices above the Play button: a match saved in this tab, one running on another device, and the
 * ranked queue. Each shows only while it applies.
 */
export function ResumeNotices({
  pendingResume,
  onResume,
  onDiscard,
  otherDevice,
  onResumeOtherDevice,
  queueing,
  onCancelQueue,
}: {
  pendingResume: ReturnType<typeof loadMatchResume>;
  onResume: () => void;
  onDiscard: () => void;
  otherDevice: ActiveMatch | null;
  onResumeOtherDevice: (m: ActiveMatch) => void;
  queueing: boolean;
  onCancelQueue: () => void;
}) {
  return (
    <>
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
              onClick={onResume}
            >
              Resume
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onDiscard}
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
              onClick={() => onResumeOtherDevice(otherDevice)}
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
              onClick={onCancelQueue}
            >
              Cancel
            </button>
          </div>
        </section>
      ) : null}
    </>
  );
}
