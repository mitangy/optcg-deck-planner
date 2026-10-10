/** Duel-web ↔ FastAPI: the recording of one of your games, for the replay viewer. Kept apart from historyApi. */
import type { MatchReplay } from "@optcg/rules/replayTimeline";
import { getApiBaseUrl } from "../config";

export type ReplayPayload = {
  match_id: string;
  your_seat: 0 | 1;
  /** Display names, indexed by seat. */
  players: [string, string];
  /** False for a game that never sent a result (the room closed on it). */
  finished: boolean;
  turns: number | null;
  replay: MatchReplay;
};

export type ReplayLoadFailure = "signed-out" | "not-found" | "in-progress" | "error";

/** Why a recording could not be loaded; `reason` picks the page's wording. */
export class ReplayLoadError extends Error {
  constructor(
    readonly reason: ReplayLoadFailure,
    message: string,
  ) {
    super(message);
    this.name = "ReplayLoadError";
  }
}

export function failureForStatus(status: number): ReplayLoadFailure {
  if (status === 401) return "signed-out";
  if (status === 404) return "not-found";
  if (status === 409) return "in-progress";
  return "error";
}

export async function fetchMatchReplay(matchId: string): Promise<ReplayPayload> {
  let res: Response;
  try {
    res = await fetch(`${getApiBaseUrl()}/duel/matches/me/${encodeURIComponent(matchId)}/replay`, { credentials: "include" });
  } catch {
    throw new ReplayLoadError("error", "Could not reach the server");
  }
  if (!res.ok) {
    let detail = `Could not load this replay (${res.status})`;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === "string" && body.detail) detail = body.detail;
    } catch {
      /* non-JSON body */
    }
    throw new ReplayLoadError(failureForStatus(res.status), detail);
  }
  return (await res.json()) as ReplayPayload;
}
