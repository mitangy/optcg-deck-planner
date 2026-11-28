import { getPlannerUrl } from "../config";

/**
 * Where "open this deck in the planner" goes. The one call site to swap for the signed-in handoff
 * (`usePlannerLink`, #1502) once it lands, so the planner opens already logged in.
 */
export function plannerDeckHref(plannerDeckId: number): string {
  return `${getPlannerUrl()}/decks/${plannerDeckId}?from=duel`;
}
