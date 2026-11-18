import { Link } from "react-router-dom";

export function BackLink({ to, label, ariaLabel, variant }: { to: string; label: string; ariaLabel?: string; variant?: "ghost" }) {
  return (
    <Link to={to} className={variant === "ghost" ? "btn btn-ghost btn-sm page-back" : "btn btn-secondary deck-config-back"} aria-label={ariaLabel}>
      {variant === "ghost" ? `← ${label}` : <>← {label}</>}
    </Link>
  );
}
