import { checkForUpdate, useUpdateStatus } from "./appVersion";
import { BuildTag } from "./BuildTag";
import { BUILD_TIME, formatBuildTime } from "./buildInfo";

function reload() {
  window.location.reload();
}

/** "Version abc1234 · Oct 2, 12:48 AM · Up to date", plus Reload / Check now when `actions` is set. */
export function VersionStatus({ actions = false }: { actions?: boolean }) {
  const status = useUpdateStatus();
  const built = formatBuildTime(BUILD_TIME);
  const label =
    status.kind === "checking"
      ? "Checking…"
      : status.kind === "latest"
        ? "Up to date"
        : status.kind === "update"
          ? `Update available (${status.deployed.sha})`
          : "Couldn’t check";
  return (
    <div className="version-status" data-status={status.kind}>
      <span className="version-line">
        Version <BuildTag />
        {built ? <span className="version-built"> · {built}</span> : null}
      </span>
      <span className="version-state" aria-live="polite">
        <span className="version-dot" aria-hidden />
        {label}
      </span>
      {!actions ? null : status.kind === "update" ? (
        <button type="button" className="btn btn-primary btn-sm" onClick={reload}>
          Reload
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={status.kind === "checking"}
          onClick={() => void checkForUpdate()}
        >
          Check now
        </button>
      )}
    </div>
  );
}

/** Lobby banner shown only while a newer deploy is live than the running bundle. */
export function UpdateNotice() {
  const status = useUpdateStatus();
  if (status.kind !== "update") return null;
  return (
    <section className="notice notice-gold" aria-label="Update available">
      <div className="notice-body">
        <strong>New version available</strong>
        <span>Reload to get the latest duel app and see what’s new.</span>
      </div>
      <div className="notice-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={reload}>
          Reload
        </button>
      </div>
    </section>
  );
}
