import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, CatalogCardResult } from "../../api";
import { useSavedShoppingDeckIds } from "../shopping/shoppingDeckFilter";
import { invalidateOwnedViews } from "./ownedCollection";
import { OwnedInput } from "../OwnedInputs";
import { useFullShoppingById } from "../shopping/lightboxActions";
import { CatalogAddDrawer } from "./CatalogAddDrawer";
import { COLLECTION_ADD_OPEN_KEY } from "../../storage/keys";
import { qk } from "../../cache/queryKeys";

/** "Add" for a card you don't own yet, the Owned stepper once you do. Same footprint either way. */
export function CollectionOwnedControl({
  cardId,
  owned,
  onSaved,
}: {
  cardId: string;
  owned: number;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const add = useMutation({
    mutationFn: () => api.setOwned(cardId, 1),
    // Refetch so the new card joins the list with its catalog details and price.
    onSuccess: () => invalidateOwnedViews(qc),
  });
  return (
    <span className="collection-owned-control">
      {owned > 0 ? (
        <OwnedInput cardId={cardId} value={owned} onSaved={onSaved} />
      ) : (
        <button
          type="button"
          className="btn secondary"
          disabled={add.isPending}
          aria-label={`Add ${cardId} to collection`}
          title={add.error ? (add.error as Error).message : undefined}
          onClick={() => add.mutate()}
        >
          {add.isError ? "Retry" : "Add"}
        </button>
      )}
    </span>
  );
}

/** Collection action for an alt-art row: "Add" at 0 owned, else a stepper over that alt's copies. */
export function CollectionAltControl({ card, onSaved }: { card: CatalogCardResult; onSaved: () => void }) {
  const qc = useQueryClient();
  const productId = card.alt_product_id ?? 0;
  const save = useMutation({
    mutationFn: (qty: number) => api.setAltOwned(card.card_id, productId, qty),
    onSuccess: () => {
      invalidateOwnedViews(qc);
      void qc.invalidateQueries({ queryKey: qk.catalogSearch.all() });
      onSaved();
    },
  });
  const owned = card.owned ?? 0;
  return (
    <span className="collection-owned-control">
      {owned > 0 ? (
        // Same size as the base card's Owned stepper so rows keep one hit target.
        <span className="shopping-extra-control">
          <button
            type="button"
            className="owned-btn"
            aria-label={`Decrease owned for ${card.card_id} alt art`}
            disabled={save.isPending}
            onClick={() => save.mutate(owned - 1)}
          >
            −
          </button>
          <span className="deck-editor-qty" title="Copies of this alt you own">
            {owned}
          </span>
          <button
            type="button"
            className="owned-btn"
            aria-label={`Increase owned for ${card.card_id} alt art`}
            disabled={save.isPending}
            onClick={() => save.mutate(owned + 1)}
          >
            +
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="btn secondary"
          disabled={save.isPending}
          aria-label={`Add ${card.name} alt art to collection`}
          title={save.error ? (save.error as Error).message : undefined}
          onClick={() => save.mutate(1)}
        >
          {save.isError ? "Retry" : "Add"}
        </button>
      )}
    </span>
  );
}

export function CollectionAddPanel({
  ownedById,
  defaultOpen,
  onScan,
  onOwnedSaved,
}: {
  ownedById: Map<string, number>;
  defaultOpen: boolean;
  onScan: () => void;
  onOwnedSaved: () => void;
}) {
  const shoppingById = useFullShoppingById(useSavedShoppingDeckIds());
  return (
    <CatalogAddDrawer
      className="collection-add"
      summary="Search the catalog or scan a card"
      storageKey={COLLECTION_ADD_OPEN_KEY}
      defaultOpen={defaultOpen}
      idleHint="Search the catalog by name or ID to add cards"
      onScan={onScan}
      renderMeta={(card) => {
        const buying = shoppingById.get(card.card_id)?.still_need ?? 0;
        return buying > 0 ? `Buying ${buying}` : null;
      }}
      renderAction={(card) =>
        card.alt_product_id ? (
          <CollectionAltControl card={card} onSaved={onOwnedSaved} />
        ) : (
          <CollectionOwnedControl
            cardId={card.card_id}
            owned={ownedById.get(card.card_id) ?? 0}
            onSaved={onOwnedSaved}
          />
        )
      }
    />
  );
}
