import { Link } from "react-router-dom";

/** The one "← Home" style for every page that navigates back (Decks, New deck, History, Match log, Settings). */
export function BackLink({ to, label, ariaLabel }: { to: string; label: string; ariaLabel?: string }) {
  return (
    <Link to={to} className="btn btn-secondary deck-config-back" aria-label={ariaLabel}>
      ← {label}
    </Link>
  );
}
