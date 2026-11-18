import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";
import { applyDisplayArtOptimistic, invalidateDisplayArtViews } from "../cards/displayArtViews";
import { busyKeyFor, busyProductFor } from "./busyKey";
import { invalidateAltOwnedViews, invalidateAltWantViews, invalidateCollectorViews } from "./invalidate";
import { applyAltBuyOptimistic, applyAltOwnedOptimistic, applyCollectorOptimistic } from "./optimistic";

export function useCardEdits({
  saveAltBuy,
}: { saveAltBuy?: (cardId: string, productId: number, qty: number) => Promise<void> } = {}) {
  const qc = useQueryClient();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [collectorBusyKey, setCollectorBusyKey] = useState<string | null>(null);
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
  const busyProductId = (cardId: string) => busyProductFor(busyKey, cardId);
  const collectorBusyProductId = (cardId: string) => busyProductFor(collectorBusyKey, cardId);
  return {
    busyKey,
    collectorBusyKey,
    error,
    setError,
    changeAltOwned,
    changeAltBuy,
    changeCollector,
    changeDisplayArt,
    busyProductId,
    collectorBusyProductId,
  };
}
