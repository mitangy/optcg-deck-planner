/** "Send feedback": the planner's network call for the shared dialog. */
import { feedbackErrorMessage, feedbackRequestBody, type FeedbackPayload } from "@optcg/site-legal/feedback";
import { getApiBaseUrl } from "./api";
import { BUILD_SHA } from "./buildInfo";

/** POST the feedback; throws an Error with a user-facing message on failure. */
export async function submitFeedback(payload: FeedbackPayload, fetchImpl: typeof fetch = fetch): Promise<void> {
  let res: Response;
  try {
    res = await fetchImpl(`${getApiBaseUrl()}/feedback`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: feedbackRequestBody(payload, { app: "planner", client_build: BUILD_SHA }),
    });
  } catch {
    throw new Error("Could not reach the server. Check your connection and try again.");
  }
  if (res.ok) return;
  throw new Error(feedbackErrorMessage(res.status));
}
