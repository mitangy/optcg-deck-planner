/** Grades the game off the page's thread (#967): the bots' analysis is seconds of work for a whole game. */
import { createGameReviewer } from "@optcg/rules/gameReview";
import { REVIEW_SLICE, type ReviewMessage, type ReviewRequest } from "./reviewProtocol";

const post = (m: ReviewMessage) => (self as unknown as { postMessage(m: ReviewMessage): void }).postMessage(m);

self.onmessage = (e: MessageEvent<ReviewRequest>) => {
  if (e.data.type !== "start") return;
  try {
    const reviewer = createGameReviewer(e.data.replay);
    const slice = () => {
      try {
        const done = reviewer.advance(REVIEW_SLICE);
        if (done) post({ type: "done", review: reviewer.result() });
        else {
          post({ type: "progress", progress: reviewer.progress(), review: reviewer.result() });
          setTimeout(slice, 0);
        }
      } catch (err) {
        post({ type: "error", message: err instanceof Error ? err.message : String(err) });
      }
    };
    slice();
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
