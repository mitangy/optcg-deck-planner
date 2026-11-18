import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useMemo } from "react";
import { Link } from "react-router-dom";
import { api, ShoppingItem } from "../../api";
import { useSavedShoppingDeckIds } from "./shoppingDeckFilter";
import { nextExtraTarget, totalOwnedCopies } from "./shoppingExtras";
import { invalidateOwnedViews } from "../collection/ownedCollection";
import { LightboxPriceAlertControl } from "../../prices/PriceAlerts";
import { LightboxPriceHistoryControl } from "../../prices/PriceHistory";
import { LightboxPanelProvider } from "../../prices/lightboxPanel";
import { qk } from "../../cache/queryKeys";

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

export function nextAltPick(current: number, extraTarget: number, adding: boolean): number {
  return Math.max(0, Math.min(adding ? current + 1 : current - 1, extraTarget));
}

export function ShoppingExtraControl({
  cardId,
  item,
  owned,
  addLabel = "Add",
  loading = false,
  altProductId = 0,
  stepperLabel,
}: {
  cardId: string;
  item: ShoppingItem | undefined;
  owned: number;
  addLabel?: string;
  /** The list or owned counts are still loading: item/owned are placeholders, so a press would overwrite a saved target (#845). */
  loading?: boolean;
  altProductId?: number;
  /** Visible name for the stepper (e.g. "To buy"); also its accessible group name. */
  stepperLabel?: string;
}) {
  const labelId = useId();
  const qc = useQueryClient();
  const stillNeed = item?.still_need ?? 0;
  const extraQty = item?.extra_qty ?? 0;
  const altPicked = altProductId > 0 ? (item?.alt_arts?.find((a) => a.product_id === altProductId)?.wanted ?? 0) : 0;
  const save = useMutation({
    mutationFn: async ({ target, adding }: { target: number; adding: boolean }) => {
      const res = await api.setShoppingExtra(cardId, target);
      if (adding && altProductId > 0) await api.setDisplayArt(cardId, altProductId);
      if (altProductId > 0 && target > 0) {
        const altQty = nextAltPick(altPicked, target, adding);
        if (altQty !== altPicked) await api.setCardPrinting(cardId, altProductId, altQty, []);
      }
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
    <span
      className="shopping-extra-control"
      role={stepperLabel && stillNeed > 0 ? "group" : undefined}
      aria-labelledby={stepperLabel && stillNeed > 0 ? labelId : undefined}
    >
      {stillNeed > 0 ? (
        <>
          {stepperLabel ? (
            <span id={labelId} className="shopping-extra-label">
              {stepperLabel}
            </span>
          ) : null}
          <button
            type="button"
            className="owned-btn"
            aria-label={`Buy fewer ${cardId}${altProductId > 0 ? " alt art" : ""}`}
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
        stepperLabel="To buy"
      />
    </>
  );
}

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

export const renderCardPageActions = (cardId: string, productId: number) => (
  <>
    <LightboxShoppingControl cardId={cardId} />
    <LightboxPriceAlertControl cardId={cardId} productId={productId} />
  </>
);

export const renderLightboxActions = (cardId: string, productId?: number, close?: () => void) => (
  <LightboxPanelProvider>
    <Link className="btn secondary lightbox-card-link" to={`/cards/${encodeURIComponent(cardId)}${productId ? `?art=${productId}` : ""}`} onClick={close}>
      Card page
    </Link>
    <LightboxShoppingControl cardId={cardId} />
    <LightboxPriceAlertControl cardId={cardId} productId={productId ?? 0} />
    <LightboxPriceHistoryControl cardId={cardId} productId={productId ?? 0} />
  </LightboxPanelProvider>
);
