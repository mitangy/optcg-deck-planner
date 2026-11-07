/** "Send feedback": the planner's network call for the shared dialog. */
import { feedbackErrorMessage, feedbackRequestBody, type FeedbackPayload } from "@optcg/site-legal/feedback";
import { ApiError, request } from "./apiClient";
import { BUILD_SHA } from "./buildInfo";

/** POST the feedback; throws an Error with a user-facing message on failure. */
export async function submitFeedback(payload: FeedbackPayload, fetchImpl: typeof fetch = fetch): Promise<void> {
  try {
    await request<unknown>("/feedback", {
      method: "POST",
      body: feedbackRequestBody(payload, { app: "planner", client_build: BUILD_SHA }),
      fetchImpl,
    });
  } catch (err) {
    // A reply with a status gets that status's wording; no reply at all (offline, timed out) is a connection problem.
    if (err instanceof ApiError && err.status > 0) throw new Error(feedbackErrorMessage(err.status));
    throw new Error("Could not reach the server. Check your connection and try again.");
  }
}
