import type { components } from "@optcg/api-client";
import { ApiError, apiCall } from "../api/http";

export type DuelEvent = components["schemas"]["EventPublic"];
export type EventStatus = DuelEvent["status"];
export type EventProgress = components["schemas"]["EventProgress"];
export type EventFormat = DuelEvent["format"];

export async function fetchCurrentEvent(): Promise<DuelEvent | null> {
  const body = await apiCall<{ event: DuelEvent | null }>("/duel/events/current");
  return body.event;
}

export async function fetchEventById(id: string): Promise<DuelEvent | null> {
  try {
    const body = await apiCall<{ event: DuelEvent | null }>(`/duel/events/${encodeURIComponent(id)}`);
    return body.event;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/** POST /duel/events/:id/join. The server checks the rules version, so a stale page cannot accept old rules. */
export async function joinEvent(id: string, rulesVersion: string): Promise<void> {
  await apiCall<unknown>(
    `/duel/events/${encodeURIComponent(id)}/join`,
    { method: "POST", json: { accept_rules: true, rules_version: rulesVersion } },
    "Could not join",
  );
}
