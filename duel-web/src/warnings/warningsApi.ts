import { ApiError, request } from "../api/http";

export type PlayerWarning = { id: number; message: string; created_at: string };

/**
 * Warnings a moderator sent the signed-in player that they have not acknowledged yet, oldest first.
 * A refused or failed call is an empty list on purpose: the notice is best effort and must never block the lobby.
 */
export async function fetchWarnings(): Promise<PlayerWarning[]> {
  let body: unknown;
  try {
    body = await request<unknown>("/duel/warnings");
  } catch (e) {
    if (e instanceof ApiError) return [];
    throw e;
  }
  return Array.isArray(body) ? (body as PlayerWarning[]).filter((w) => typeof w?.id === "number" && typeof w.message === "string") : [];
}

/** Acknowledge one warning. An error reply is ignored on purpose: the notice just comes back next visit. */
export async function ackWarning(id: number): Promise<void> {
  try {
    await request<unknown>(`/duel/warnings/${id}/ack`, { method: "POST" });
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
  }
}
