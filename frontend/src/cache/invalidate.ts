import { useQueryClient } from "@tanstack/react-query";
import { invalidateOwnedViews } from "../pages/collection/ownedCollection";
import { qk } from "./queryKeys";

export function invalidateAltWantViews(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: qk.shopping.all() });
  void qc.invalidateQueries({ queryKey: qk.deck.all() });
  void qc.invalidateQueries({ queryKey: qk.decks() });
  void qc.invalidateQueries({ queryKey: qk.groupBuy.all() });
  void qc.invalidateQueries({ queryKey: qk.groupBuys() });
}

/** Alt owned changes still-needed copies everywhere, including group-buy needs. */
export function invalidateAltOwnedViews(qc: ReturnType<typeof useQueryClient>) {
  invalidateOwnedViews(qc);
  void qc.invalidateQueries({ queryKey: qk.decks() });
  void qc.invalidateQueries({ queryKey: qk.groupBuy.all() });
  void qc.invalidateQueries({ queryKey: qk.groupBuys() });
}

/** Collector copies change totals and the deck's still-needed copies (owned copies fill them first), so refetch everything. */
export function invalidateCollectorViews(qc: ReturnType<typeof useQueryClient>) {
  invalidateAltOwnedViews(qc);
  void qc.invalidateQueries({ queryKey: qk.shopping.all() });
  void qc.invalidateQueries({ queryKey: qk.deck.all() });
}
