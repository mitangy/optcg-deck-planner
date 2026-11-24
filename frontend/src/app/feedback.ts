import { feedbackErrorMessage, feedbackRequestBody, type FeedbackPayload } from "@optcg/site-legal/feedback";
import { ApiError, request } from "../apiClient";
import { BUILD_SHA } from "@optcg/ui/appShell";

export async function submitFeedback(payload: FeedbackPayload, fetchImpl: typeof fetch = fetch): Promise<void> {
  try {
    await request<unknown>("/feedback", {
      method: "POST",
      body: feedbackRequestBody(payload, { app: "planner", client_build: BUILD_SHA }),
      fetchImpl,
    });
  } catch (err) {
    if (err instanceof ApiError && err.status > 0) throw new Error(feedbackErrorMessage(err.status));
    throw new Error("Could not reach the server. Check your connection and try again.");
  }
}
