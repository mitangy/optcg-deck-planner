import { getApiBaseUrl } from "../config";
import { apiError } from "../net/api";

export type EventStatus = "upcoming" | "live" | "ended" | "drawn";

export type EventProgress = { games: number; opponents: number; eligible: boolean };

export type DuelEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  prize: string;
  winners: number;
  rules_version: string;
  min_games: number;
  min_opponents: number;
  min_turns: number;
  status: EventStatus;
  /** Published before the event starts, so the draw can be checked afterwards. */
  seed_hash: string | null;
  /** Revealed with the draw. */
  seed: string | null;
  eligible_user_ids: number[] | null;
  viewer: "anonymous" | "guest" | "player" | "staff";
  can_join: boolean;
  cant_join_reason: string | null;
  opted_in: boolean;
  progress: EventProgress | null;
};

/** GET /duel/events/current (public): the event to show, or null when there is none. Throws when the call fails. */
export async function fetchCurrentEvent(): Promise<DuelEvent | null> {
  const res = await fetch(`${getApiBaseUrl()}/duel/events/current`, { credentials: "include" });
  if (!res.ok) throw await apiError(res, `Request failed (${res.status})`);
  const body = (await res.json()) as { event: DuelEvent | null };
  return body.event;
}

/** GET /duel/events/:id (public): one event whatever the date, or null when the id is unknown. Throws when the call fails. */
export async function fetchEventById(id: string): Promise<DuelEvent | null> {
  const res = await fetch(`${getApiBaseUrl()}/duel/events/${encodeURIComponent(id)}`, { credentials: "include" });
  if (res.status === 404) return null;
  if (!res.ok) throw await apiError(res, `Request failed (${res.status})`);
  const body = (await res.json()) as { event: DuelEvent | null };
  return body.event;
}

/** POST /duel/events/:id/join. The server checks the rules version, so a stale page cannot accept old rules. */
export async function joinEvent(id: string, rulesVersion: string): Promise<void> {
  const res = await fetch(`${getApiBaseUrl()}/duel/events/${encodeURIComponent(id)}/join`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accept_rules: true, rules_version: rulesVersion }),
  });
  if (!res.ok) throw await apiError(res, `Could not join (${res.status})`);
}
