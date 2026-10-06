/** "Report a problem" / "Send feedback": the duel-web network call for the shared dialog. */
import { feedbackErrorMessage, feedbackRequestBody, type FeedbackPayload } from "@optcg/site-legal/feedback";
import { BUILD_SHA } from "./buildInfo";
import { getApiBaseUrl } from "./config";
import { getMatchContext } from "./matchContext";

/** POST the feedback; throws an Error with a user-facing message on failure. */
export async function submitFeedback(payload: FeedbackPayload, fetchImpl: typeof fetch = fetch): Promise<void> {
  // Outside a match there is no game token or room; a signed-in player is known by the session cookie.
  const { gameToken, roomId } = getMatchContext();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (gameToken) headers.Authorization = `Bearer ${gameToken}`;
  let res: Response;
  try {
    res = await fetchImpl(`${getApiBaseUrl()}/feedback`, {
      method: "POST",
      credentials: "include",
      headers,
      body: feedbackRequestBody(payload, { app: "duel", client_build: BUILD_SHA, room_id: roomId }),
    });
  } catch {
    throw new Error("Could not reach the server. Check your connection and try again.");
  }
  if (res.ok) return;
  throw new Error(feedbackErrorMessage(res.status));
}
