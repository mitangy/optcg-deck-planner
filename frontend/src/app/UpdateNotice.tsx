import { Link } from "react-router-dom";
import { WhatsNewCard } from "@optcg/patch-notes";
import { BuildTag, checkForUpdate, dismissUpdate, usePendingUpdate, useUpdateStatus } from "@optcg/ui/appShell";

function reload() {
  window.location.reload();
}

/** Bottom-right card shown while a newer deploy is live. Fixed, so it never moves the page. */
export function UpdateNotice() {
  const pending = usePendingUpdate();
  if (!pending) return null;
  return (
    <aside className="update-card" role="region" aria-label="Update available">
      <h2 className="update-card-heading">New version available</h2>
      <p className="update-card-text">Reload to get the latest planner and see what’s new.</p>
      <div className="update-card-actions">
        <button type="button" className="btn primary" onClick={reload}>
          Reload
        </button>
        <button type="button" className="ghost" onClick={dismissUpdate}>
          Later
        </button>
      </div>
    </aside>
  );
}

/** Both cards sit in the same corner, so the What’s new card waits while the update card is up. */
export function CornerNotices() {
  const pending = usePendingUpdate();
  return pending ? <UpdateNotice /> : <WhatsNewCard app="planner" Link={Link} />;
}

/** "Version abc1234 · Up to date", with Check now / Reload. */
export function VersionStatus() {
  const status = useUpdateStatus();
  const label =
    status.kind === "checking"
      ? "Checking…"
      : status.kind === "latest"
        ? "Up to date"
        : status.kind === "update"
          ? `Update available (${status.deployed.sha})`
          : "Couldn’t check";
  return (
    <p className="version-status" data-status={status.kind}>
      <span>
        Version <BuildTag />
      </span>
      <span aria-live="polite"> · {label}</span>
      {status.kind === "update" ? (
        <button type="button" className="ghost" onClick={reload}>
          Reload
        </button>
      ) : (
        <button
          type="button"
          className="ghost"
          disabled={status.kind === "checking"}
          onClick={() => void checkForUpdate()}
        >
          Check now
        </button>
      )}
    </p>
  );
}
