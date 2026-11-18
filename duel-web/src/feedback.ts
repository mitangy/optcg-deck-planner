import { feedbackErrorMessage, feedbackRequestBody, type FeedbackPayload } from "@optcg/site-legal/feedback";
import { BUILD_SHA } from "@optcg/ui/appShell";
import { ApiError, request } from "./api/http";
import { getMatchContext } from "./matchContext";

export async function submitFeedback(payload: FeedbackPayload, fetchImpl: typeof fetch = fetch): Promise<void> {
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
    if (e instanceof ApiError && e.status > 0) throw new Error(feedbackErrorMessage(e.status));
    throw new Error("Could not reach the server. Check your connection and try again.");
  }
}
