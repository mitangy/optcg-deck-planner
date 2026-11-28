import { createProductEvents, sessionAnonId } from "@optcg/api-client";
import { getApiBaseUrl } from "../apiClient";
import { DUEL_URL } from "./duelLink";

export const productEvents = createProductEvents({ app: "planner", endpoint: () => `${getApiBaseUrl()}/events`, anonId: sessionAnonId });

/** The duel app's links add `?from=duel`; a plain referrer from the duel site counts too. Returns true when it was a duel visit. */
export function cameFromDuel(search: string, referrer: string, duelUrl: string): boolean {
  if (new URLSearchParams(search).get("from") === "duel") return true;
  try {
    return referrer !== "" && new URL(referrer).origin === new URL(duelUrl).origin;
  } catch {
    return false;
  }
}

const OPENED_KEY = "optcg.fromDuel.v1";

/** True the first time in this tab session: a reload keeps the referrer but is not a new visit. */
export function firstFromDuelThisSession(storage: Pick<Storage, "getItem" | "setItem">): boolean {
  try {
    if (storage.getItem(OPENED_KEY)) return false;
    storage.setItem(OPENED_KEY, "1");
  } catch {
    // Storage blocked: count it.
  }
  return true;
}

/** Counts one planner visit that came from the duel app, then drops the marker so a shared link does not carry it. */
export function startPlannerEvents(): void {
  productEvents.start();
  if (!cameFromDuel(window.location.search, document.referrer, DUEL_URL)) return;
  if (firstFromDuelThisSession(sessionStorage)) productEvents.track("planner_open_from_duel");
  const url = new URL(window.location.href);
  if (url.searchParams.has("from")) {
    url.searchParams.delete("from");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }
}
