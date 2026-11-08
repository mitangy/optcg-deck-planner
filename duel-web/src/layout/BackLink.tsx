import { Link } from "react-router-dom";

/**
 * The one "← Home" style for every page that navigates back (Decks, New deck, History, Match log, Settings).
 * `variant: "ghost"` is the quiet text link the legal and rules pages use.
 */
export function BackLink({ to, label, ariaLabel, variant }: { to: string; label: string; ariaLabel?: string; variant?: "ghost" }) {
  return (
    <Link to={to} className={variant === "ghost" ? "btn btn-ghost btn-sm page-back" : "btn btn-secondary deck-config-back"} aria-label={ariaLabel}>
      {/* One text node on the ghost link, as the legal pages always had it: split nodes shape (and so position) the text a sub-pixel differently. */}
      {variant === "ghost" ? `← ${label}` : <>← {label}</>}
    </Link>
  );
}
