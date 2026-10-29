import { getApiBaseUrl } from "../config";

export type PlayerWarning = { id: number; message: string; created_at: string };

/** Warnings a moderator sent the signed-in player that they have not acknowledged yet, oldest first. */
export async function fetchWarnings(): Promise<PlayerWarning[]> {
  const res = await fetch(`${getApiBaseUrl()}/duel/warnings`, { credentials: "include" });
  if (!res.ok) return [];
  const body = (await res.json()) as unknown;
  return Array.isArray(body) ? (body as PlayerWarning[]).filter((w) => typeof w?.id === "number" && typeof w.message === "string") : [];
}

export async function ackWarning(id: number): Promise<void> {
  await fetch(`${getApiBaseUrl()}/duel/warnings/${id}/ack`, { method: "POST", credentials: "include" });
}
