import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";
import { applyDisplayArtOptimistic, invalidateDisplayArtViews } from "../cards/displayArtViews";
import { busyKeyFor, busyProductFor } from "./busyKey";
import { invalidateAltOwnedViews, invalidateAltWantViews, invalidateCollectorViews } from "./invalidate";
import { applyAltBuyOptimistic, applyAltOwnedOptimistic, applyCollectorOptimistic } from "./optimistic";

/**
 * Save alt-art owned counts, buy picks, collector wants (#1035) and the chosen display art from a page: optimistic patches to
 * every cached view, the save, then a refetch so values and totals come from the server. The
 * Collection keeps no other editing state; Shopping and the Deck page pass `saveAltBuy` because
 * only the buy-pick API call differs between them (`setCardPrinting` vs `setDeckCardPrinting`).
 * `saveAltBuy` runs after the optimistic patch and applies its own server answer.
 */
export function useCardEdits({
  saveAltBuy,
  saveSpread,
}: {
  saveAltBuy?: (cardId: string, productId: number, qty: number) => Promise<void>;
  /** "One of each art" (#1292): spreads the card's copies over every art; the server answer replaces the cached views. */
  saveSpread?: (cardId: string) => Promise<void>;
} = {}) {
  const qc = useQueryClient();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [collectorBusyKey, setCollectorBusyKey] = useState<string | null>(null);
  const [spreadBusyId, setSpreadBusyId] = useState<string | null>(null);
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
  const spreadArts = async (cardId: string) => {
    setError(null);
    setSpreadBusyId(cardId);
    try {
      await saveSpread?.(cardId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      invalidateAltWantViews(qc);
      setSpreadBusyId(null);
    }
  };
  const changeCollector = async (cardId: string, productId: number, qty: number) => {
    setError(null);
    setCollectorBusyKey(busyKeyFor(cardId, productId));
    applyCollectorOptimistic(qc, cardId, productId, qty);
    try {
      const res = await api.setCollectorWant(cardId, productId, qty);
      applyCollectorOptimistic(qc, cardId, productId, res.qty);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      invalidateCollectorViews(qc);
      setCollectorBusyKey(null);
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
  /** The alt printing of `cardId` whose collector save is in flight, if any. */
  const collectorBusyProductId = (cardId: string) => busyProductFor(collectorBusyKey, cardId);
  return {
    busyKey,
    collectorBusyKey,
    error,
    setError,
    changeAltOwned,
    changeAltBuy,
    spreadArts,
    spreadBusyId,
    changeCollector,
    changeDisplayArt,
    busyProductId,
    collectorBusyProductId,
  };
}
