import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, CatalogCardResult, DeckDetail, money } from "../../api";
import {
  CardSearchInput,
  CollapsibleDrawer,
} from "../../ui/cardListControls";
import { invalidateOwnedViews } from "../collection/ownedCollection";
import { deckDelta, type DeckStatsCard } from "@optcg/deck-analytics";
import { useStatsAtlas } from "@optcg/deck-analytics/ui";
import { Select } from "@optcg/ui/popups";
import { CardThumb } from "../../ui/CardThumb";
import { InlineSkeleton } from "../../ui/Skeleton";
import { isDonCardType } from "../../cards/donCards";
import {
  COLOR_OPTIONS,
  CARD_TYPE_OPTIONS,
  catalogRowKey,
  AltArtChip,
} from "../collection/CatalogAddDrawer";
import { DON_DECK_LIMIT, setDeckCardNeeded, MAIN_DECK_LIMIT } from "./deckEditing";
import { DECK_EDITOR_COLOR_KEY, DECK_EDITOR_TYPE_KEY, DECK_SEARCH_OPEN_KEY } from "../../storage/keys";
import { useCatalogSearch } from "../../hooks/useCatalogSearch";

/** Main-deck rows (leader included, DON!! excluded) in the shape the stats and hints code reads. */
function toStatsCards(cards: DeckDetail["cards"]): DeckStatsCard[] {
  return cards
    .filter((c) => c.section !== "don" && !isDonCardType(c.card_type))
    .map((c) => ({ id: c.card_id, copies: c.needed }));
}

const DELTA_MS = 4500;

export function DeckEditorPanel({
  deckId,
  deck,
  onUpdated,
  onChanged,
  onReplaceList,
}: {
  deckId: number;
  deck: DeckDetail;
  onUpdated: (detail: DeckDetail) => void;
  /** Fired after a save that leaves the card in the deck, so the list can point at its row. */
  onChanged?: (cardId: string) => void;
  /** Opens the "Replace with deck list" dialog (#1016). */
  onReplaceList?: () => void;
}) {
  const qc = useQueryClient();
  const atlas = useStatsAtlas().data;
  const [delta, setDelta] = useState<{ text: string; key: number } | null>(null);
  const deltaKey = useRef(0);
  useEffect(() => {
    if (!delta) return;
    const t = window.setTimeout(() => setDelta(null), DELTA_MS);
    return () => window.clearTimeout(t);
  }, [delta]);

  /** Say what an add/remove moved. Purely informational: never blocks or confirms anything. */
  function flashDelta(cardId: string, after: DeckDetail) {
    if (!atlas) return;
    const text = deckDelta(toStatsCards(deck.cards), toStatsCards(after.cards), cardId, atlas, after.leader_card_id);
    if (text) setDelta({ text, key: ++deltaKey.current });
  }

  const { query, setQuery, color, setColor, cardType, setCardType, searchEnabled, searchQ } = useCatalogSearch({
    colorKey: DECK_EDITOR_COLOR_KEY,
    typeKey: DECK_EDITOR_TYPE_KEY,
  });
  const [err, setErr] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const neededById = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of deck.cards) map.set(c.card_id, c.needed);
    return map;
  }, [deck.cards]);

  const mainCount = deck.main_cards ?? deck.cards
    .filter((c) => c.section !== "don" && !isDonCardType(c.card_type))
    .reduce((s, c) => s + c.needed, 0);
  const donCount = deck.don_cards ?? deck.cards
    .filter((c) => c.section === "don" || isDonCardType(c.card_type))
    .reduce((s, c) => s + c.needed, 0);

  async function addCopies(card: CatalogCardResult, add: number) {
    setErr(null);
    setPendingId(card.card_id);
    try {
      const current = neededById.get(card.card_id) ?? 0;
      const next = current + add;
      if (isDonCardType(card.card_type)) {
        const projectedDon = donCount - current + next;
        if (projectedDon > DON_DECK_LIMIT) {
          setErr(`DON!! deck is limited to ${DON_DECK_LIMIT} cards.`);
          return;
        }
      }
      const detail = await setDeckCardNeeded(deckId, card.card_id, next);
      if (detail) {
        onUpdated(detail);
        flashDelta(card.card_id, detail);
        onChanged?.(card.card_id);
        if (card.alt_product_id) {
          // Adding from an alt-art row also shows that art for the card.
          await api.setDisplayArt(card.card_id, card.alt_product_id);
          invalidateOwnedViews(qc);
        }
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPendingId(null);
    }
  }

  async function setNeeded(cardId: string, needed: number) {
    setErr(null);
    setPendingId(cardId);
    try {
      const detail = await setDeckCardNeeded(deckId, cardId, Math.max(0, needed));
      if (detail) {
        onUpdated(detail);
        flashDelta(cardId, detail);
        if (needed > 0) onChanged?.(cardId);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPendingId(null);
    }
  }

  const searchSummary = [
    `Main ${mainCount}/${MAIN_DECK_LIMIT}`,
    `DON!! ${donCount}/${DON_DECK_LIMIT}`,
    searchEnabled && searchQ.data ? `${searchQ.data.length} results` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="deck-editor">
      {onReplaceList ? (
        <div className="deck-editor-replace">
          <button type="button" className="btn secondary" onClick={onReplaceList}>
            Replace with deck list
          </button>
        </div>
      ) : null}
      <div className="dh-delta-slot" role="status" aria-live="polite">
        {delta ? (
          <span key={delta.key} className="dh-delta">
            {delta.text}
          </span>
        ) : null}
      </div>
      <CollapsibleDrawer
        label="Add cards"
        summary={searchSummary}
        storageKey={DECK_SEARCH_OPEN_KEY}
        defaultOpen
      >
        <div className="deck-editor-filters">
          <CardSearchInput value={query} onChange={setQuery} />
          <div className="deck-editor-filter-row">
            <label className="deck-editor-select">
              <span className="sr-only">Color</span>
              <Select
                value={color}
                onChange={setColor}
                aria-label="Filter by color"
                options={COLOR_OPTIONS}
              />
            </label>
            <label className="deck-editor-select">
              <span className="sr-only">Card type</span>
              <Select
                value={cardType}
                onChange={setCardType}
                aria-label="Filter by card type"
                options={CARD_TYPE_OPTIONS}
              />
            </label>
          </div>
        </div>

        {err && <p className="error deck-editor-status">{err}</p>}

        {!searchEnabled && (
          <p className="muted deck-editor-status">Search name, ID, color, or type</p>
        )}
        {searchEnabled && searchQ.isLoading && (
          <InlineSkeleton lines={3} label="Searching catalog…" />
        )}
        {searchEnabled && searchQ.error && (
          <p className="error deck-editor-status">{(searchQ.error as Error).message}</p>
        )}
        {searchEnabled && searchQ.data && searchQ.data.length === 0 && (
          <p className="muted deck-editor-status">No catalog matches</p>
        )}

        {searchQ.data && searchQ.data.length > 0 && (
          <ul className="deck-editor-results">
            {searchQ.data.map((card) => {
              const inDeck = neededById.get(card.card_id) ?? 0;
              const busy = pendingId === card.card_id;
              const altLabel = card.alt_product_id ? " alt art" : "";
              return (
                <li
                  key={catalogRowKey(card)}
                  className="deck-editor-result"
                  data-catalog-id={card.card_id}
                  data-alt-product-id={card.alt_product_id ?? undefined}
                >
                  <div className="deck-editor-result-main">
                    <CardThumb src={card.image_url || undefined} cardId={card.card_id} alt={card.name} />
                    <div>
                      <div className="card-id">
                        {card.card_id}
                        <AltArtChip card={card} />
                      </div>
                      <div>{card.name}</div>
                      <div className="muted">
                        {[
                          card.color,
                          card.card_type,
                          card.rarity,
                          card.alt_product_id ? card.group_name : "",
                          card.alt_product_id ? money(card.market_price) : "",
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                        {inDeck > 0 ? ` · In deck ×${inDeck}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="deck-editor-result-actions">
                    {inDeck > 0 && (
                      <>
                        <button
                          type="button"
                          className="owned-btn"
                          aria-label={`Decrease ${card.card_id}${altLabel}`}
                          disabled={busy}
                          onClick={() => void setNeeded(card.card_id, inDeck - 1)}
                        >
                          −
                        </button>
                        <span className="deck-editor-qty">{inDeck}</span>
                        <button
                          type="button"
                          className="owned-btn"
                          aria-label={`Increase ${card.card_id}${altLabel}`}
                          disabled={busy}
                          onClick={() => void addCopies(card, 1)}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          className="ghost danger"
                          disabled={busy}
                          onClick={() => void setNeeded(card.card_id, 0)}
                        >
                          Remove
                        </button>
                      </>
                    )}
                    {inDeck === 0 && (
                      <button
                        type="button"
                        className="btn secondary"
                        aria-label={altLabel ? `Add ${card.card_id}${altLabel}` : undefined}
                        disabled={busy}
                        onClick={() => void addCopies(card, 1)}
                      >
                        Add
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CollapsibleDrawer>
    </div>
  );
}
