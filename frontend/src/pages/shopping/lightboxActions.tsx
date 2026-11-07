import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { api, ShoppingItem } from "../../api";
import { useSavedShoppingDeckIds } from "./shoppingDeckFilter";
import { nextExtraTarget, totalOwnedCopies } from "./shoppingExtras";
import { invalidateOwnedViews } from "../collection/ownedCollection";
import { LightboxPriceAlertControl } from "../../prices/PriceAlerts";
import { LightboxPriceHistoryControl } from "../../prices/PriceHistory";
import { qk } from "../../cache/queryKeys";

/** Every card on the shopping list for the ticked decks (+ added directly), keyed by card id. */
function useFullShoppingState(deckIds?: number[]): { byId: Map<string, ShoppingItem>; loaded: boolean } {
  const q = useQuery({
    queryKey: qk.shopping.full(deckIds),
    queryFn: () => api.shopping(deckIds),
  });
  const byId = useMemo(() => new Map((q.data?.items ?? []).map((i) => [i.card_id, i])), [q.data]);
  return { byId, loaded: q.data !== undefined };
}

export function useFullShoppingById(deckIds?: number[]): Map<string, ShoppingItem> {
  return useFullShoppingState(deckIds).byId;
}

/** "Add" for a card that needs nothing yet; otherwise a copies-to-buy stepper. Same footprint either way. */
export function ShoppingExtraControl({
  cardId,
  item,
  owned,
  addLabel = "Add",
  loading = false,
  altProductId = 0,
}: {
  cardId: string;
  item: ShoppingItem | undefined;
  owned: number;
  addLabel?: string;
  /** The list or owned counts are still loading: item/owned are placeholders, so a press would overwrite a saved target (#845). */
  loading?: boolean;
  /** Set on an alt-art search row: adding also makes that alt the card's shown art. */
  altProductId?: number;
}) {
  const qc = useQueryClient();
  const stillNeed = item?.still_need ?? 0;
  const extraQty = item?.extra_qty ?? 0;
  const save = useMutation({
    mutationFn: async ({ target, adding }: { target: number; adding: boolean }) => {
      const res = await api.setShoppingExtra(cardId, target);
      // Adding from an alt-art row also shows that art for the card.
      if (adding && altProductId > 0) await api.setDisplayArt(cardId, altProductId);
      return res;
    },
    // Stay pending until the list refetches, so a quick second press never steps from stale counts.
    onSuccess: async () => {
      invalidateOwnedViews(qc);
      await qc.refetchQueries({ queryKey: qk.shopping.all(), type: "active" });
    },
  });
  const step = (delta: 1 | -1) =>
    save.mutate({
      target: nextExtraTarget({ owned, deckNeed: item?.deck_need ?? 0, extraQty, stillNeed }, delta),
      adding: delta > 0,
    });
  return (
    <span className="shopping-extra-control">
      {stillNeed > 0 ? (
        <>
          <button
            type="button"
            className="owned-btn"
            aria-label={`Buy fewer ${cardId}${altProductId > 0 ? " alt art" : ""}`}
            // Deck-driven copies are changed in the deck; only direct targets step down here.
            disabled={loading || save.isPending || extraQty === 0}
            onClick={() => step(-1)}
          >
            −
          </button>
          <span className="deck-editor-qty" title="Copies to buy">
            {stillNeed}
          </span>
          <button
            type="button"
            className="owned-btn"
            aria-label={`Buy more ${cardId}${altProductId > 0 ? " alt art" : ""}`}
            disabled={loading || save.isPending}
            onClick={() => step(1)}
          >
            +
          </button>
        </>
      ) : (
        <button
          type="button"
          className="btn secondary"
          disabled={loading || save.isPending}
          aria-label={`Add ${cardId}${altProductId > 0 ? " alt art" : ""} to shopping list`}
          title={save.error ? (save.error as Error).message : undefined}
          onClick={() => step(1)}
        >
          {save.isError ? "Retry" : addLabel}
        </button>
      )}
    </span>
  );
}

/** Owned copies and the shopping row for a card, matching how the backend computes still_need (#626). */
export function useShoppingCardState(deckIds?: number[]) {
  const { byId: shoppingById, loaded: shoppingLoaded } = useFullShoppingState(deckIds);
  const ownedQ = useQuery({ queryKey: qk.owned.all(), queryFn: () => api.ownedCollection() });
  const ownedById = useMemo(
    () => new Map((ownedQ.data?.items ?? []).map((i) => [i.card_id, totalOwnedCopies(i)])),
    [ownedQ.data],
  );
  const ownedOf = (cardId: string) => {
    const item = shoppingById.get(cardId);
    return item ? totalOwnedCopies(item) : (ownedById.get(cardId) ?? 0);
  };
  const loading = !shoppingLoaded || ownedQ.data === undefined;
  return { shoppingById, ownedOf, loading };
}

/** Under an enlarged card: what you own and need, and a one-press way onto the shopping list (#842). */
export function LightboxShoppingControl({ cardId }: { cardId: string }) {
  const { shoppingById, ownedOf, loading } = useShoppingCardState(useSavedShoppingDeckIds());
  const item = shoppingById.get(cardId);
  const meta = [loading ? "Owned …" : `Owned ${ownedOf(cardId)}`];
  const deckNeed = item?.deck_need ?? 0;
  if (deckNeed > 0) meta.push(`Decks need ${deckNeed}`);
  return (
    <>
      <p className="lightbox-action-meta muted">{meta.join(" · ")}</p>
      <ShoppingExtraControl
        cardId={cardId}
        item={item}
        owned={ownedOf(cardId)}
        addLabel="Add to shopping list"
        loading={loading}
      />
    </>
  );
}

/** A scanned card's shopping control on the Shopping page (#842). */
export function ShoppingScanHitAction({ cardId }: { cardId: string }) {
  const { shoppingById, ownedOf, loading } = useShoppingCardState(useSavedShoppingDeckIds());
  return (
    <div className="scan-hit-owned">
      <span className="muted">On shopping list</span>
      <ShoppingExtraControl
        cardId={cardId}
        item={shoppingById.get(cardId)}
        owned={ownedOf(cardId)}
        addLabel="Add to shopping list"
        loading={loading}
      />
    </div>
  );
}

/** Owned count, shopping list and price alert on the card page (#953), for the art it shows. */
export const renderCardPageActions = (cardId: string, productId: number) => (
  <>
    <LightboxShoppingControl cardId={cardId} />
    <LightboxPriceAlertControl cardId={cardId} productId={productId} />
  </>
);

export const renderLightboxActions = (cardId: string, productId?: number, close?: () => void) => (
  <>
    <Link className="btn secondary lightbox-card-link" to={`/cards/${encodeURIComponent(cardId)}${productId ? `?art=${productId}` : ""}`} onClick={close}>
      Card page
    </Link>
    <LightboxShoppingControl cardId={cardId} />
    <LightboxPriceAlertControl cardId={cardId} productId={productId ?? 0} />
    <LightboxPriceHistoryControl cardId={cardId} productId={productId ?? 0} />
  </>
);
