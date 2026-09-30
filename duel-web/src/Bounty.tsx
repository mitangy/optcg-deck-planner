/** The One Piece Berry sign: a B struck by two vertical bars, drawn in currentColor. */
export function BerryIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ? `berry-icon ${className}` : "berry-icon"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M7 5v14M7 5h6a3.5 3.5 0 0 1 0 7H7M7 12h7a3.5 3.5 0 0 1 0 7H7" />
      <path d="M10 2v20M13.5 2v20" />
    </svg>
  );
}

/** A ranked rating shown as a Bounty: Berry sign then the amount. */
export function BountyAmount({ amount }: { amount: number }) {
  return (
    <span className="bounty-amount" aria-label={`Bounty ${amount.toLocaleString("en-US")} berries`}>
      <BerryIcon />
      {amount.toLocaleString("en-US")}
    </span>
  );
}
