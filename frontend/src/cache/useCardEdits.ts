import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";
import { applyDisplayArtOptimistic, invalidateDisplayArtViews } from "../cards/displayArtViews";
import { busyKeyFor, busyProductFor } from "./busyKey";
import { invalidateAltOwnedViews, invalidateAltWantViews } from "./invalidate";
import { applyAltBuyOptimistic, applyAltOwnedOptimistic } from "./optimistic";

/**
 * Save alt-art owned counts, buy picks and the chosen display art from a page: optimistic patches to
 * every cached view, the save, then a refetch so values and totals come from the server. The
 * Collection keeps no other editing state; Shopping and the Deck page pass `saveAltBuy` because
 * only the buy-pick API call differs between them (`setCardPrinting` vs `setDeckCardPrinting`).
 * `saveAltBuy` runs after the optimistic patch and applies its own server answer.
 */
export function useCardEdits({
  saveAltBuy,
}: { saveAltBuy?: (cardId: string, productId: number, qty: number) => Promise<void> } = {}) {
  const qc = useQueryClient();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const changeAltOwned = async (cardId: string, productId: number, qty: number) => {
    setError(null);
    setBusyKey(busyKeyFor(cardId, productId));
    applyAltOwnedOptimistic(qc, cardId, productId, qty);
    try {
      const res = await api.setAltOwned(cardId, productId, qty);
      applyAltOwnedOptimistic(qc, cardId, productId, res.qty);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      invalidateAltOwnedViews(qc);
      setBusyKey(null);
    }
  };
  const changeAltBuy = async (cardId: string, productId: number, qty: number) => {
    setError(null);
    setBusyKey(busyKeyFor(cardId, productId));
    applyAltBuyOptimistic(qc, cardId, productId, qty);
    try {
      await saveAltBuy?.(cardId, productId, qty);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      invalidateAltWantViews(qc);
      setBusyKey(null);
    }
  };
  const changeDisplayArt = async (cardId: string, productId: number) => {
    setError(null);
    applyDisplayArtOptimistic(qc, cardId, productId);
    try {
      await api.setDisplayArt(cardId, productId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      invalidateDisplayArtViews(qc);
    }
  };
  /** The alt printing of `cardId` whose save is in flight, if any. */
  const busyProductId = (cardId: string) => busyProductFor(busyKey, cardId);
  return { busyKey, error, setError, changeAltOwned, changeAltBuy, changeDisplayArt, busyProductId };
}
