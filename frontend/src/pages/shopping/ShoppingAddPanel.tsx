import { useShoppingCardState, ShoppingExtraControl } from "./lightboxActions";
import { CatalogAddDrawer } from "../collection/CatalogAddDrawer";
import { HeadPopover } from "../../ui/HeadPopover";
import { SHOPPING_ADD_OPEN_KEY } from "../../storage/keys";

function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}

/** "Add cards" button in the page head. The catalog search opens over the list, so the list never moves (#1342). */
export function ShoppingAddPanel({ deckIds }: { deckIds?: number[] }) {
  const { shoppingById, ownedOf, loading } = useShoppingCardState(deckIds);
  return (
    <HeadPopover label="Add cards" icon={<PlusIcon />} className="btn secondary add-cards-btn" panelLabel="Add cards to buy" width={600}>
      <CatalogAddDrawer
        bare
        className="shopping-add"
        summary=""
        // The key only prefixes the remembered colour and card type; the panel itself no longer remembers open or closed.
        storageKey={SHOPPING_ADD_OPEN_KEY}
        defaultOpen
        idleHint="Search the catalog by name or ID to add cards to buy"
        searchPlaceholder="Add a card from the catalog"
        searchLabel="Add a card from the catalog"
        searchIcon="search"
        renderMeta={(card) => {
          const deckNeed = shoppingById.get(card.card_id)?.deck_need ?? 0;
          return [`Own ${ownedOf(card.card_id)}`, deckNeed > 0 ? `Decks need ${deckNeed}` : ""]
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
    </HeadPopover>
  );
}
