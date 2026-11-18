import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, CatalogCardResult } from "../../api";
import { useSavedShoppingDeckIds } from "../shopping/shoppingDeckFilter";
import { invalidateOwnedViews } from "./ownedCollection";
import { OwnedInput } from "../OwnedInputs";
import { useFullShoppingById } from "../shopping/lightboxActions";
import { CatalogAddDrawer } from "./CatalogAddDrawer";
import { HeadPopover } from "../../ui/HeadPopover";
import { COLLECTION_ADD_OPEN_KEY } from "../../storage/keys";
import { qk } from "../../cache/queryKeys";

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

function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}

/** "Add cards" button in the page head; the catalog search opens over the list like on Shopping (#1342). */
export function CollectionAddPanel({
  ownedById,
  onScan,
  onOwnedSaved,
}: {
  ownedById: Map<string, number>;
  onScan: () => void;
  onOwnedSaved: () => void;
}) {
  const shoppingById = useFullShoppingById(useSavedShoppingDeckIds());
  return (
    <HeadPopover label="Add cards" icon={<PlusIcon />} className="btn secondary add-cards-btn" panelLabel="Add cards to your collection" width={600}>
      {(close: () => void) => (
        <CatalogAddDrawer
          bare
          className="collection-add"
          summary=""
          // The key only prefixes the remembered colour and card type.
          storageKey={COLLECTION_ADD_OPEN_KEY}
          defaultOpen
          idleHint="Search the catalog by name or ID to add cards"
          searchPlaceholder="Add a card from the catalog"
          searchLabel="Add a card from the catalog"
          searchIcon="search"
          onScan={() => {
            close();
            onScan();
          }}
          renderMeta={(card) => {
            const buying = shoppingById.get(card.card_id)?.still_need ?? 0;
            return buying > 0 ? `Buying ${buying}` : null;
          }}
          renderAction={(card) =>
            card.alt_product_id ? (
              <CollectionAltControl card={card} onSaved={onOwnedSaved} />
            ) : (
              <CollectionOwnedControl cardId={card.card_id} owned={ownedById.get(card.card_id) ?? 0} onSaved={onOwnedSaved} />
            )
          }
        />
      )}
    </HeadPopover>
  );
}
