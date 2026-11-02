import type { useQueryClient } from "@tanstack/react-query";
import type { DeckDetail, OwnedCollectionResponse, ShoppingResponse } from "./api";
import { patchOwnedCollectionDisplayArt } from "./ownedCollection";

/** Display art is a view choice only: refresh the views that show it. */
export function invalidateDisplayArtViews(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["shopping"] });
  void qc.invalidateQueries({ queryKey: ["deck"] });
  void qc.invalidateQueries({ queryKey: ["owned"] });
  void qc.invalidateQueries({ queryKey: ["group-buy"] });
  void qc.invalidateQueries({ queryKey: ["group-buys"] });
}

/** Patch the chosen art (null = automatic, 0 = base) onto every cached view of a card. */
export function applyDisplayArtOptimistic(
  qc: ReturnType<typeof useQueryClient>,
  cardId: string,
  productId: number | null,
) {
  const id = cardId.toUpperCase();
  qc.setQueriesData<ShoppingResponse>({ queryKey: ["shopping"] }, (old) =>
    old
      ? {
          ...old,
          items: old.items.map((item) =>
            item.card_id.toUpperCase() === id ? { ...item, display_art: productId } : item,
          ),
        }
      : old,
  );
  qc.setQueriesData<DeckDetail>({ queryKey: ["deck"] }, (old) =>
    old
      ? {
          ...old,
          cards: old.cards.map((card) =>
            card.card_id.toUpperCase() === id ? { ...card, display_art: productId } : card,
          ),
        }
      : old,
  );
  qc.setQueriesData<OwnedCollectionResponse>({ queryKey: ["owned"] }, (old) =>
    old ? patchOwnedCollectionDisplayArt(old, id, productId) : old,
  );
}
