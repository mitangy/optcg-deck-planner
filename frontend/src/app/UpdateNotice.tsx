import { Link } from "react-router-dom";
import { WhatsNewCard } from "@optcg/patch-notes";
import { BuildTag, checkForUpdate, dismissUpdate, usePendingUpdate, useUpdateStatus } from "@optcg/ui/appShell";

function reload() {
  window.location.reload();
}

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

export function CornerNotices() {
  const pending = usePendingUpdate();
  return pending ? <UpdateNotice /> : <WhatsNewCard app="planner" Link={Link} />;
}

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
