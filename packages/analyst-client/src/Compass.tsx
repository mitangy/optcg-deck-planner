/** The round compass launcher (bottom-right). Its needle swings while Log Pose is working. */
export function LogPoseCompass({
  working,
  unread,
  requests = 0,
  requestOnly = false,
  onClick,
}: {
  working: boolean;
  unread: boolean;
  /** Access requests waiting for an owner: shown as a count badge (not the unread dot). */
  requests?: number;
  /** Chat isn't on for this player: the compass opens the access request. */
  requestOnly?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="logpose lp-compass"
      aria-label="Log Pose"
      title={
        requestOnly
          ? "Request access to Log Pose"
          : working
            ? "Log Pose is working…"
            : requests > 0
              ? `Log Pose: ${requests} access request${requests === 1 ? "" : "s"} waiting`
              : unread
                ? "Log Pose has a new answer"
                : "Ask Log Pose"
      }
      data-working={working ? "true" : undefined}
      onClick={onClick}
    >
      <CompassIcon />
      {requests > 0 ? (
        <span className="lp-compass-count" data-testid="lp-compass-count">
          {requests > 9 ? "9+" : requests}
          <span className="lp-sr">{" access requests waiting"}</span>
        </span>
      ) : unread ? (
        <span className="lp-compass-dot" aria-hidden="true" />
      ) : null}
    </button>
  );
}

export function CompassIcon() {
  return (
    <svg className="lp-compass-svg" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle className="lp-compass-bezel" cx="24" cy="24" r="19" />
      <circle className="lp-compass-face" cx="24" cy="24" r="15.5" />
      <g className="lp-compass-ticks">
        <path d="M24 9.5v3M24 35.5v3M9.5 24h3M35.5 24h3" />
      </g>
      <g className="lp-needle">
        <path className="lp-needle-n" d="M24 11.5 28 24h-8z" />
        <path className="lp-needle-s" d="M24 36.5 20 24h8z" />
      </g>
      <circle className="lp-compass-pin" cx="24" cy="24" r="2" />
    </svg>
  );
}
