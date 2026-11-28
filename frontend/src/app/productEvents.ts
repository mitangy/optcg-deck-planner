import { createProductEvents } from "@optcg/api-client";
import { readStored, writeStored } from "@optcg/ui/storage";
import { getApiBaseUrl } from "../apiClient";
import { DUEL_URL } from "./duelLink";

const ANON_KEY = "optcg.anonId.v1";
const ANON_RE = /^[a-zA-Z0-9_-]{8,64}$/;

function anonId(): string | null {
  const existing = readStored(ANON_KEY);
  if (existing && ANON_RE.test(existing)) return existing;
  const next =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  return writeStored(ANON_KEY, next) ? next : null;
}

export const productEvents = createProductEvents({ app: "planner", endpoint: () => `${getApiBaseUrl()}/events`, anonId });

/** The duel app's links add `?from=duel`; a plain referrer from the duel site counts too. Returns true when it was a duel visit. */
export function cameFromDuel(search: string, referrer: string, duelUrl: string): boolean {
  if (new URLSearchParams(search).get("from") === "duel") return true;
  try {
    return referrer !== "" && new URL(referrer).origin === new URL(duelUrl).origin;
  } catch {
    return false;
  }
}

/** Counts one planner visit that came from the duel app, then drops the marker so a shared link does not carry it. */
export function startPlannerEvents(): void {
  productEvents.start();
  if (!cameFromDuel(window.location.search, document.referrer, DUEL_URL)) return;
  productEvents.track("planner_open_from_duel");
  const url = new URL(window.location.href);
  if (url.searchParams.has("from")) {
    url.searchParams.delete("from");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }
}
