import { Link } from "react-router-dom";
import { TournamentRow } from "./TournamentRow";
import { useTournaments } from "./hooks";
import "./tournaments.css";

/** Lobby card: your open and running tournaments, with a nudge when your match is ready. */
export function TournamentsCard({ signedIn }: { signedIn: boolean }) {
  const { list } = useTournaments(signedIn);
  if (!signedIn) return null;
  const active = (list ?? []).filter((t) => t.status === "open" || t.status === "running");
  const readyCount = active.filter((t) => t.my_match_ready && t.status === "running").length;
  return (
    <section className="tcard" aria-label="Tournaments">
      <div className="tcard-head">
        <h2 className="tcard-title">
          Tournaments
          {readyCount > 0 ? <span className="tcard-count">{readyCount} ready</span> : null}
        </h2>
        <Link to="/tournaments" className="btn btn-ghost btn-sm">
          {active.length > 0 ? "See all" : "New tournament"}
        </Link>
      </div>
      {active.length > 0 ? (
        <ul className="trow-list">
          {active.slice(0, 3).map((t) => (
            <TournamentRow key={t.id} t={t} />
          ))}
        </ul>
      ) : list ? (
        <p className="tcard-empty">Run a bracket or round robin with your friends.</p>
      ) : null}
    </section>
  );
}
