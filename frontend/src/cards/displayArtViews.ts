import type { useQueryClient } from "@tanstack/react-query";
import type { DeckDetail, OwnedCollectionResponse, ShoppingResponse } from "../api";
import { patchOwnedCollectionDisplayArt } from "../pages/collection/ownedCollection";
import { qk } from "../cache/queryKeys";

export function invalidateDisplayArtViews(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: qk.shopping.all() });
  void qc.invalidateQueries({ queryKey: qk.deck.all() });
  void qc.invalidateQueries({ queryKey: qk.owned.all() });
  void qc.invalidateQueries({ queryKey: qk.groupBuy.all() });
  void qc.invalidateQueries({ queryKey: qk.groupBuys() });
}

export function applyDisplayArtOptimistic(
  qc: ReturnType<typeof useQueryClient>,
  cardId: string,
  productId: number | null,
) {
  const id = cardId.toUpperCase();
  qc.setQueriesData<ShoppingResponse>({ queryKey: qk.shopping.all() }, (old) =>
    old
      ? {
          ...old,
          items: old.items.map((item) =>
            item.card_id.toUpperCase() === id ? { ...item, display_art: productId } : item,
          ),
        }
      : old,
  );
  qc.setQueriesData<DeckDetail>({ queryKey: qk.deck.all() }, (old) =>
    old
      ? {
          ...old,
          cards: old.cards.map((card) =>
            card.card_id.toUpperCase() === id ? { ...card, display_art: productId } : card,
          ),
        }
      : old,
  );
  qc.setQueriesData<OwnedCollectionResponse>({ queryKey: qk.owned.all() }, (old) =>
    old ? patchOwnedCollectionDisplayArt(old, id, productId) : old,
  );
}
