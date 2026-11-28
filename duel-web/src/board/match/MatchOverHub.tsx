import { useAsyncResource } from "../../lib/useAsyncResource";
import { plannerDeckHref } from "../../decks/plannerDeckLink";
import { fetchDeckMissingCost, type DeckMissingCost } from "../../net/api";

export type MatchHub = {
  /** Saved deck the player just used; null when unknown. */
  deckId: string | null;
  signedIn: boolean;
  onInvite: () => void;
};

export function formatUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function missingChipLabel(m: Pick<DeckMissingCost, "missing_copies" | "cost_usd">): string {
  return m.missing_copies === 0 ? "You own every card" : `This deck is missing ${formatUsd(m.cost_usd)}`;
}

function MissingCostChip({ deckId, load }: { deckId: string; load: (id: string) => Promise<DeckMissingCost | null> }) {
  const res = useAsyncResource(() => load(deckId), [deckId]);
  // The slot keeps its height in every state, so the dialog does not resize when the price arrives (or turns out to be unavailable).
  if (res.status === "loading") return <span className="match-hub-chip match-hub-chip-skeleton" aria-hidden />;
  if (res.status === "error" || res.data == null) return null;
  const m = res.data;
  if (m.missing_copies === 0) return <span className="match-hub-chip match-hub-chip-owned">{missingChipLabel(m)}</span>;
  return (
    <a
      className="match-hub-chip match-hub-chip-missing"
      href={plannerDeckHref(m.planner_deck_id)}
      target="_blank"
      rel="noopener"
      title={`${m.missing_copies} cop${m.missing_copies === 1 ? "y" : "ies"} of ${m.missing_cards} card${m.missing_cards === 1 ? "" : "s"} to buy`}
    >
      <span>{missingChipLabel(m)}</span>
      <span className="match-hub-chip-go" aria-hidden>
        Price it in the planner ›
      </span>
    </a>
  );
}

/** Match over, after Rematch: bring someone new, and what this deck still costs the player. */
export function MatchOverHub({
  hub,
  loadMissing = fetchDeckMissingCost,
}: {
  hub: MatchHub;
  loadMissing?: (deckId: string) => Promise<DeckMissingCost | null>;
}) {
  // Guests have no owned counts, so there is nothing to subtract and no price worth showing.
  const showCost = hub.signedIn && hub.deckId != null;
  return (
    <div className="match-hub">
      <button type="button" className="btn btn-secondary match-hub-invite" onClick={hub.onInvite}>
        Invite someone else
      </button>
      {showCost ? (
        <div className="match-hub-cost" data-testid="match-hub-cost">
          <MissingCostChip deckId={hub.deckId!} load={loadMissing} />
        </div>
      ) : null}
    </div>
  );
}
