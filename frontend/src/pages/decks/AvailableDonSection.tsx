import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api, CatalogCardResult, DeckDetail, money } from "../../api";
import { CardSearchInput, CollapsibleDrawer } from "../../cardListControls";
import { CardThumb } from "../../CardThumb";
import { InlineSkeleton } from "../../Skeleton";
import { isDonCardType } from "../../donCards";
import { DON_DECK_LIMIT, setDeckCardNeeded } from "./deckEditing";

const DECK_DON_AVAILABLE_OPEN_KEY = "optcg_deck_don_available_open";

export function AvailableDonSection({
  deckId,
  deck,
  onUpdated,
}: {
  deckId: number;
  deck: DeckDetail;
  onUpdated: (detail: DeckDetail) => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(query.trim()), 250);
    return () => window.clearTimeout(t);
  }, [query]);
  const donQ = useQuery({
    queryKey: ["catalog-don", debouncedQ],
    queryFn: () => api.searchCatalog({ q: debouncedQ || undefined, card_type: "DON", limit: 100 }),
    staleTime: 60_000,
    // Keep the grid on screen while the next search loads so typing never collapses it to a skeleton.
    placeholderData: keepPreviousData,
  });

  const neededById = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of deck.cards) map.set(c.card_id, c.needed);
    return map;
  }, [deck.cards]);

  const donCount = deck.don_cards ?? deck.cards
    .filter((c) => c.section === "don" || isDonCardType(c.card_type))
    .reduce((s, c) => s + c.needed, 0);

  async function addOne(card: CatalogCardResult) {
    setErr(null);
    const current = neededById.get(card.card_id) ?? 0;
    if (donCount >= DON_DECK_LIMIT) {
      setErr(`DON!! deck is limited to ${DON_DECK_LIMIT} cards.`);
      return;
    }
    setPendingId(card.card_id);
    try {
      const detail = await setDeckCardNeeded(deckId, card.card_id, current + 1);
      if (detail) onUpdated(detail);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPendingId(null);
    }
  }

  const resultCount = donQ.data?.length ?? 0;
  const summary = [
    `${donCount}/${DON_DECK_LIMIT} in deck`,
    resultCount > 0 ? `${resultCount} ${debouncedQ ? "found" : "available"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="don-available">
      <CollapsibleDrawer
        label="Available DON!! cards"
        summary={summary}
        storageKey={DECK_DON_AVAILABLE_OPEN_KEY}
        defaultOpen={false}
      >
        <div className="deck-editor-filters">
          <CardSearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search DON!! by name, set or ID"
            label="Search DON!! cards"
          />
        </div>
        {err && <p className="error deck-editor-status">{err}</p>}
        {donQ.isLoading && <InlineSkeleton lines={3} label="Loading DON!! cards…" />}
        {donQ.error && <p className="error deck-editor-status">{(donQ.error as Error).message}</p>}
        {donQ.data && donQ.data.length === 0 && (
          <p className="muted deck-editor-status">
            {debouncedQ ? `No DON!! cards match “${debouncedQ}”.` : "No DON!! cards in the catalog yet."}
          </p>
        )}
        {donQ.data && donQ.data.length > 0 && (
          <ul className="don-available-list">
            {donQ.data.map((card) => {
              const inDeck = neededById.get(card.card_id) ?? 0;
              const busy = pendingId === card.card_id;
              const atCap = donCount >= DON_DECK_LIMIT && inDeck === 0;
              return (
                <li key={card.card_id} className="don-tile">
                  <CardThumb src={card.image_url || undefined} cardId={card.card_id} alt={card.name} />
                  <div className="don-tile-text">
                    <div className="card-id">{card.card_id}</div>
                    <div className="don-tile-name">{card.name}</div>
                    <div className="muted don-tile-meta">
                      {[card.group_name, money(card.market_price)].filter(Boolean).join(" · ")}
                    </div>
                    {inDeck > 0 && <div className="don-tile-indeck">In deck ×{inDeck}</div>}
                  </div>
                  <button
                    type="button"
                    className="btn secondary don-tile-add"
                    disabled={busy || atCap}
                    onClick={() => void addOne(card)}
                  >
                    {inDeck > 0 ? "Add another" : "Add"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CollapsibleDrawer>
    </div>
  );
}
