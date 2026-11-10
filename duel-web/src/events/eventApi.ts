import type { components } from "@optcg/api-client";
import { ApiError, apiCall } from "../api/http";

// The event shape is generated from the backend's OpenAPI schema (refactor 2.1c). Notes on fields: `seed_hash` is
// published before the event starts so the draw can be checked afterwards, `seed` is revealed with the draw, and
// `prize_method` "draw" is a seeded giveaway among eligible players while "placement" is awarded by hand.
export type DuelEvent = components["schemas"]["EventPublic"];
export type EventStatus = DuelEvent["status"];
export type EventProgress = components["schemas"]["EventProgress"];
export type EventFormat = DuelEvent["format"];

/** GET /duel/events/current (public): the event to show, or null when there is none. Throws when the call fails. */
export async function fetchCurrentEvent(): Promise<DuelEvent | null> {
  const body = await apiCall<{ event: DuelEvent | null }>("/duel/events/current");
  return body.event;
}

/** GET /duel/events/:id (public): one event whatever the date, or null when the id is unknown. Throws when the call fails. */
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
