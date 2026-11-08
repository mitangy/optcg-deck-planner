import { ApiError, request } from "../api/http";
import { getMatchContext } from "../matchContext";
import { reportErrorMessage, type ReportRequest } from "./reportLogic";

/** POST /duel/reports. A guest in a match is known by the game token; a signed-in player by the session cookie. */
export async function submitReport(body: ReportRequest, fetchImpl: typeof fetch = fetch): Promise<{ id: number; duplicate: boolean }> {
  const { gameToken } = getMatchContext();
  const headers: Record<string, string> = {};
  if (gameToken) headers.Authorization = `Bearer ${gameToken}`;
  let out: { id?: number; duplicate?: boolean } | undefined;
  try {
    out = await request<{ id?: number; duplicate?: boolean } | undefined>("/duel/reports", { method: "POST", headers, json: body, fetchImpl });
  } catch (e) {
    // An answer from the server (any status) gets the report wording; no answer at all is "could not reach".
    if (e instanceof ApiError && e.status > 0) throw new ApiError(e.status, e.detail, reportErrorMessage(e.status));
    // A 2xx whose body is not JSON still means the report went in.
    if (e instanceof SyntaxError) return { id: 0, duplicate: false };
    throw new ApiError(0, "Could not reach the server. Check your connection and try again.");
  }
  return { id: Number(out?.id ?? 0), duplicate: out?.duplicate === true };
}
