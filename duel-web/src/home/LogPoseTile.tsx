import { useLogPoseAsk } from "@optcg/analyst-client";
import { deckContext } from "../logPose";
import type { SavedDeck } from "../decks/storage";

/** "Ask Log Pose about <deck>": only for players who have Log Pose (the ask function is null otherwise). */
export function LogPoseTile({ deck }: { deck: SavedDeck | null }) {
  const ask = useLogPoseAsk();
  if (!ask || !deck) return null;
  return (
    <button
      type="button"
      className="logpose-tile"
      onClick={() => ask({ prompt: "How should I play this deck?", context: { deck: deckContext(deck) } })}
    >
      <span className="logpose-tile-glyph" aria-hidden>
        ✦
      </span>
      <span className="logpose-tile-text">
        <span className="logpose-tile-title">Ask Log Pose about {deck.name}</span>
        <span className="logpose-tile-sub">Game plan, mulligans and key turns</span>
      </span>
    </button>
  );
}
