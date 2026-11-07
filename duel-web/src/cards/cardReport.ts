/** "Report this card": testers flag cards that do not play as printed. */
import { BUILD_SHA } from "@optcg/ui/appShell";
import { ApiError, request } from "../api/http";
import { getMatchContext } from "../matchContext";

/** Matches the API floor so the form can explain before a round trip. */
export const MIN_REPORT_LENGTH = 10;
export const MAX_REPORT_LENGTH = 2000;

/** Returns a message to show when the description is not usable, else null. */
export function reportDescriptionError(description: string): string | null {
  const len = description.trim().length;
  if (len < MIN_REPORT_LENGTH) {
    return `Describe what went wrong (at least ${MIN_REPORT_LENGTH} characters).`;
  }
  if (len > MAX_REPORT_LENGTH) {
    return `Keep it under ${MAX_REPORT_LENGTH} characters.`;
  }
  return null;
}

function reportSource(pathname: string): string {
  const first = pathname.split("/").filter(Boolean)[0] ?? "";
  return first.slice(0, 32);
}

/** POST the report; throws an Error with a user-facing message on failure. */
export async function submitCardReport(
  cardId: string,
  description: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const invalid = reportDescriptionError(description);
  if (invalid) throw new Error(invalid);
  const matchContext = getMatchContext();
  const headers: Record<string, string> = {};
  if (matchContext.gameToken) headers.Authorization = `Bearer ${matchContext.gameToken}`;
  try {
    await request<unknown>("/duel/card-reports", {
      method: "POST",
      headers,
      json: {
        card_id: cardId,
        description: description.trim(),
        source: reportSource(typeof window === "undefined" ? "" : window.location.pathname),
        room_id: matchContext.roomId ?? "",
        client_build: BUILD_SHA,
      },
      fetchImpl,
    });
  } catch (e) {
    if (!(e instanceof ApiError) || e.status === 0) throw e;
    if (e.status === 429) {
      throw new Error("You've sent a lot of reports. Try again in a few minutes.");
    }
    throw new Error(`Could not send the report (${e.status}). Try again.`);
  }
}
