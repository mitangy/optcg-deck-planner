export function CountIcon({ kind }: { kind: "life" | "deck" | "don" | "trash" }) {
  const common = { width: 14, height: 14, viewBox: "0 0 16 16", "aria-hidden": true, className: "count-icon" };
  switch (kind) {
    case "life":
      return (
        <svg {...common}>
          <path d="M8 14 2.2 8.2a3.3 3.3 0 0 1 4.7-4.7L8 4.6l1.1-1.1a3.3 3.3 0 0 1 4.7 4.7z" fill="currentColor" />
        </svg>
      );
    case "deck":
      return (
        <svg {...common}>
          <rect x="4.5" y="1.5" width="8" height="11" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M2.5 4v9.3c0 .7.5 1.2 1.2 1.2H10" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    case "don":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5.6 5.4h2.1c1.6 0 2.7 1 2.7 2.6s-1.1 2.6-2.7 2.6H5.6z" fill="currentColor" />
        </svg>
      );
    case "trash":
      return (
        <svg {...common}>
          <path d="M3 4.5h10M6.2 4.5V3h3.6v1.5M4.2 4.5l.6 8.6h6.4l.6-8.6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      );
  }
}
