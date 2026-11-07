import { ApiError, apiCall } from "../api/http";

export type EventStatus = "upcoming" | "live" | "ended" | "drawn";

export type EventProgress = { games: number; opponents: number; eligible: boolean };

export type EventFormat = "casual" | "single_elim" | "round_robin" | "swiss";

export type DuelEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  /** Short prize summary. */
  prize: string;
  description: string;
  prize_details: string;
  /** draw: a seeded giveaway among eligible players. placement: top finishers, awarded by hand. */
  prize_method: "draw" | "placement";
  format: EventFormat;
  bracket_size: number | null;
  best_of: 1 | 3;
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
