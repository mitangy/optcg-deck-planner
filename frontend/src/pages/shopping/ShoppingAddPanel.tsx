import { useShoppingCardState, ShoppingExtraControl } from "./lightboxActions";
import { CatalogAddDrawer } from "../collection/CatalogAddDrawer";
import { SHOPPING_ADD_OPEN_KEY } from "../../storage/keys";

export function ShoppingAddPanel({ defaultOpen, deckIds }: { defaultOpen: boolean; deckIds?: number[] }) {
  const { shoppingById, ownedOf, loading } = useShoppingCardState(deckIds);
  return (
    <CatalogAddDrawer
      className="shopping-add"
      summary="Search the catalog to add cards to buy, no deck needed"
      storageKey={SHOPPING_ADD_OPEN_KEY}
      defaultOpen={defaultOpen}
      idleHint="Search the catalog by name or ID to add cards to buy"
      renderMeta={(card) => {
        const deckNeed = shoppingById.get(card.card_id)?.deck_need ?? 0;
        return [`Owned ${ownedOf(card.card_id)}`, deckNeed > 0 ? `Decks need ${deckNeed}` : ""]
          .filter(Boolean)
          .join(" · ");
      }}
      renderAction={(card) => (
        <ShoppingExtraControl
          cardId={card.card_id}
          item={shoppingById.get(card.card_id)}
          owned={ownedOf(card.card_id)}
          loading={loading}
          altProductId={card.alt_product_id ?? 0}
        />
      )}
    />
  );
}
