import { ApiError, request } from "../api/http";

export type PlayerWarning = { id: number; message: string; created_at: string };

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

export async function ackWarning(id: number): Promise<void> {
  try {
    await request<unknown>(`/duel/warnings/${id}/ack`, { method: "POST" });
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
  }
}
