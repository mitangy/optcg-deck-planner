import { Link } from "react-router-dom";
import { useLogPoseAsk } from "@optcg/analyst-client";
import { deckContext } from "../logPose";
import { getPlannerUrl } from "../config";
import type { SavedDeck } from "../decks/storage";

/** Features the other sites don't have. Phones show title-only tiles, at most four, and skip Spectate (the Spectate mode button is right above). */
export function OnlyOnDuel({
  deck,
  onSpectate,
  disabled,
}: {
  deck: SavedDeck | null;
  onSpectate: () => void;
  disabled?: boolean;
}) {
  const ask = useLogPoseAsk();
  return (
    <section className="only-duel" aria-labelledby="only-duel-label">
      <h2 id="only-duel-label" className="only-duel-label">
        Only on OPTCG Duel
      </h2>
      <div className="only-duel-grid">
        <Link to="/leaderboard" className="only-tile">
          <span className="only-tile-title">Ranked bounties</span>
          <span className="only-tile-blurb">Win games, raise your Bounty, climb the board.</span>
        </Link>
        {ask ? (
          <button
            type="button"
            className="only-tile"
            onClick={() =>
              ask(
                deck
                  ? { prompt: "How should I play this deck?", context: { deck: deckContext(deck) } }
                  : { prompt: "How do I get better at this game?" },
              )
            }
          >
            <span className="only-tile-title">Log Pose coach</span>
            <span className="only-tile-blurb">Ask about your deck, matchups and mistakes.</span>
          </button>
        ) : null}
        <button type="button" className="only-tile only-tile-dup" disabled={disabled} onClick={onSpectate}>
          <span className="only-tile-title">Spectate</span>
          <span className="only-tile-blurb">Watch friends and top players live.</span>
        </button>
        <Link to="/history" className="only-tile">
          <span className="only-tile-title">Replays</span>
          <span className="only-tile-blurb">Step through any game you played.</span>
        </Link>
        <a href={getPlannerUrl()} target="_blank" rel="noopener" className="only-tile">
          <span className="only-tile-title">Planner + prices</span>
          <span className="only-tile-blurb">Build decks with your collection and market prices.</span>
        </a>
        <Link to="/settings" className="only-tile">
          <span className="only-tile-title">Crew themes</span>
          <span className="only-tile-blurb">Straw Hats, Wano, Marines and more.</span>
        </Link>
      </div>
    </section>
  );
}
