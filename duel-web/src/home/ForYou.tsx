import { Link } from "react-router-dom";
import type { MatchHistoryEntry } from "../history/historyApi";
import type { LiveCounts } from "../net/api";
import { forYouItems } from "./forYou";

export function ForYou({
  games,
  live,
  onSpectate,
  disabled,
}: {
  games: MatchHistoryEntry[] | null | undefined;
  live: LiveCounts | null;
  onSpectate: () => void;
  disabled?: boolean;
}) {
  const last = games?.[0];
  const items = forYouItems({
    lastMatch: last ? { id: last.match_id, opponent: last.opponent_name, won: last.won, finished: last.finished } : null,
    liveMatches: live?.matches ?? null,
  });
  if (items.length === 0) return null;
  return (
    <section className="only-duel for-you" aria-labelledby="for-you-label">
      <h2 id="for-you-label" className="only-duel-label">
        For you
      </h2>
      <div className="for-you-grid">
        {items.map((item) =>
          item.kind === "review" ? (
            <Link key={item.kind} to={item.to} className="only-tile">
              <span className="for-you-title">{item.title}</span>
              <span className="for-you-blurb">{item.blurb}</span>
            </Link>
          ) : (
            <button key={item.kind} type="button" className="only-tile" disabled={disabled} onClick={onSpectate}>
              <span className="for-you-title">{item.title}</span>
              <span className="for-you-blurb">{item.blurb}</span>
            </button>
          ),
        )}
      </div>
    </section>
  );
}
