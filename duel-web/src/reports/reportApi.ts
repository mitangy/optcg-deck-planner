import { getApiBaseUrl } from "../config";
import { getMatchContext } from "../matchContext";
import { reportErrorMessage, type ReportRequest } from "./reportLogic";

/** POST /duel/reports. A guest in a match is known by the game token; a signed-in player by the session cookie. */
export async function submitReport(body: ReportRequest, fetchImpl: typeof fetch = fetch): Promise<{ id: number; duplicate: boolean }> {
  const { gameToken } = getMatchContext();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (gameToken) headers.Authorization = `Bearer ${gameToken}`;
  let res: Response;
  try {
    res = await fetchImpl(`${getApiBaseUrl()}/duel/reports`, { method: "POST", credentials: "include", headers, body: JSON.stringify(body) });
  } catch {
    throw new Error("Could not reach the server. Check your connection and try again.");
  }
  if (!res.ok) throw new Error(reportErrorMessage(res.status));
  try {
    const out = (await res.json()) as { id?: number; duplicate?: boolean };
    return { id: Number(out.id ?? 0), duplicate: out.duplicate === true };
  } catch {
    return { id: 0, duplicate: false };
  }
}
