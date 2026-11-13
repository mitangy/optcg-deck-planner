import { useCanSpreadArts } from "./artSet";

/**
 * "One of each art" (#1292): spreads a card's copies evenly over its base art and every alt. Renders
 * only for an any-number card with alt arts, and is mounted only where saving is possible, so the
 * card stats download starts only on those pages. aria-disabled, not disabled, and a fixed label, so a
 * save neither resizes the button nor drops focus.
 */
export function SpreadArtsAction({
  card,
  busy = false,
  onSpread,
}: {
  card: { card_id: string; alt_arts?: unknown[] | null };
  busy?: boolean;
  onSpread: () => void;
}) {
  const eligible = useCanSpreadArts(card);
  if (!eligible) return null;
  const arts = (card.alt_arts?.length ?? 0) + 1;
  return (
    <button
      type="button"
      className="buy-split-spread"
      aria-disabled={busy}
      title={`Spread your copies evenly across all ${arts} arts`}
      onClick={() => !busy && onSpread()}
    >
      <span className="buy-split-spread-text">One of each art</span>
      <span className="buy-split-spread-hint">Split over all {arts} arts</span>
    </button>
  );
}
