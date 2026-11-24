/** Opens Log Pose with the start of a sentence in the box, so the player finishes it with the card they have in mind (#1450). */
export const DESCRIBE_A_CARD_ASK = { prompt: "Find cards that ", send: false } as const;

/** "Describe a card" button for a deck editor. The editor renders it only when `useLogPoseAsk()` is non-null and passes that function in. */
/** `className` carries the app's own button variant (the planner and duel app name it differently). */
export function DescribeCardButton({ ask, className }: { ask: (ask: { prompt: string; send?: boolean }) => void; className?: string }) {
  return (
    <button type="button" className={`btn lp-describe${className ? ` ${className}` : ""}`} onClick={() => ask(DESCRIBE_A_CARD_ASK)}>
      <span className="lp-describe-icon" aria-hidden="true">
        <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" focusable="false">
          <circle cx="24" cy="24" r="20" />
          <circle cx="24" cy="24" r="15" strokeDasharray="1.5 3" />
          <path d="M24 6l3.5 14.5L42 24l-14.5 3.5L24 42l-3.5-14.5L6 24l14.5-3.5z" fill="currentColor" fillOpacity="0.15" />
          <path d="M24 6v36M6 24h36" strokeOpacity="0.5" />
        </svg>
      </span>
      Describe a card
    </button>
  );
}
