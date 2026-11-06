import { Link } from "react-router-dom";
import { formatLabel } from "./bracket";
import type { TournamentSummary } from "./tournamentApi";

const STATUS_TEXT: Record<TournamentSummary["status"], string> = {
  open: "Signing up",
  running: "Running",
  finished: "Finished",
  cancelled: "Cancelled",
};

/** One tournament as a link row: name, format, and what needs you. */
export function TournamentRow({ t }: { t: TournamentSummary }) {
  const ready = t.my_match_ready && t.status === "running";
  return (
    <li className="trow-item">
      <Link to={`/tournaments/${t.code}`} className="trow">
        <span className="trow-text">
          <span className="trow-name">{t.name}</span>
          <span className="trow-meta">
            {formatLabel(t)} · {t.players_joined} joined
          </span>
        </span>
        {ready ? (
          <span className="tchip tchip-ready">Your match is ready</span>
        ) : t.my_role === "invited" ? (
          <span className="tchip tchip-ready">Invited</span>
        ) : (
          <span className="tchip" data-status={t.status}>
            {STATUS_TEXT[t.status]}
          </span>
        )}
      </Link>
    </li>
  );
}
