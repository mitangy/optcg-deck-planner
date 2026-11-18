import { ApiError, request } from "../api/http";
import { getMatchContext } from "../matchContext";
import { reportErrorMessage, type ReportRequest } from "./reportLogic";

export async function submitReport(body: ReportRequest, fetchImpl: typeof fetch = fetch): Promise<{ id: number; duplicate: boolean }> {
  const { gameToken } = getMatchContext();
  const headers: Record<string, string> = {};
  if (gameToken) headers.Authorization = `Bearer ${gameToken}`;
  let out: { id?: number; duplicate?: boolean } | undefined;
  try {
    out = await request<{ id?: number; duplicate?: boolean } | undefined>("/duel/reports", { method: "POST", headers, json: body, fetchImpl });
  } catch (e) {
    if (e instanceof ApiError && e.status > 0) throw new ApiError(e.status, e.detail, reportErrorMessage(e.status));
    if (e instanceof SyntaxError) return { id: 0, duplicate: false };
    throw new ApiError(0, "Could not reach the server. Check your connection and try again.");
  }
  return { id: Number(out?.id ?? 0), duplicate: out?.duplicate === true };
}
