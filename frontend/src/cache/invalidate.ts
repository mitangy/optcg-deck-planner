import { useQueryClient } from "@tanstack/react-query";
import { invalidateOwnedViews } from "../ownedCollection";

export function invalidateAltWantViews(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["shopping"] });
  void qc.invalidateQueries({ queryKey: ["deck"] });
  void qc.invalidateQueries({ queryKey: ["decks"] });
  void qc.invalidateQueries({ queryKey: ["group-buy"] });
  void qc.invalidateQueries({ queryKey: ["group-buys"] });
}

/** Alt owned changes still-needed copies everywhere, including group-buy needs. */
export function invalidateAltOwnedViews(qc: ReturnType<typeof useQueryClient>) {
  invalidateOwnedViews(qc);
  void qc.invalidateQueries({ queryKey: ["decks"] });
  void qc.invalidateQueries({ queryKey: ["group-buy"] });
  void qc.invalidateQueries({ queryKey: ["group-buys"] });
}

/** Collector copies change totals and the deck's still-needed copies (owned copies fill them first), so refetch everything. */
export function invalidateCollectorViews(qc: ReturnType<typeof useQueryClient>) {
  invalidateAltOwnedViews(qc);
  void qc.invalidateQueries({ queryKey: ["shopping"] });
  void qc.invalidateQueries({ queryKey: ["deck"] });
}
