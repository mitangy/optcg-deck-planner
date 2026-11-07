/** "Report a problem" / "Send feedback": the duel-web network call for the shared dialog. */
import { feedbackErrorMessage, feedbackRequestBody, type FeedbackPayload } from "@optcg/site-legal/feedback";
import { BUILD_SHA } from "@optcg/ui/appShell";
import { ApiError, request } from "./api/http";
import { getMatchContext } from "./matchContext";

/** POST the feedback; throws an Error with a user-facing message on failure. */
export async function submitFeedback(payload: FeedbackPayload, fetchImpl: typeof fetch = fetch): Promise<void> {
  // Outside a match there is no game token or room; a signed-in player is known by the session cookie.
  const { gameToken, roomId } = getMatchContext();
  const headers: Record<string, string> = {};
  if (gameToken) headers.Authorization = `Bearer ${gameToken}`;
  try {
    await request<unknown>("/feedback", {
      method: "POST",
      headers,
      body: feedbackRequestBody(payload, { app: "duel", client_build: BUILD_SHA, room_id: roomId }),
      fetchImpl,
    });
  } catch (e) {
    // An answer from the server (any status) gets the feedback wording; no answer at all is "could not reach".
    if (e instanceof ApiError && e.status > 0) throw new Error(feedbackErrorMessage(e.status));
    throw new Error("Could not reach the server. Check your connection and try again.");
  }
}
