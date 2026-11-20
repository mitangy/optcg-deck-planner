import { resolveCardImageUrl } from "../decks/artPrefs";
import { useArtFallback } from "../cards/useArtFallback";

function LeaderArt({ defId }: { defId: string | null }) {
  const { src, fail } = useArtFallback(defId ? resolveCardImageUrl(defId, { size: "thumb" }) : null, defId);
  return src ? (
    <img className="history-leader-art" src={src} alt="" loading="lazy" onError={fail} />
  ) : (
    <span className="history-leader-art history-leader-art-empty" aria-hidden />
  );
}

/** Your Leader behind on the left, the opponent's in front on the right. Decorative: the names are in the text beside it. */
export function LeaderPair({ yours, theirs }: { yours: string | null; theirs: string | null }) {
  return (
    <span className="history-pair" aria-hidden>
      <LeaderArt defId={yours} />
      <LeaderArt defId={theirs} />
    </span>
  );
}
