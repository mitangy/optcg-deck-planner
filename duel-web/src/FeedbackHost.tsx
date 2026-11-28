import { lazy, Suspense } from "react";
import { closeFeedback, useOpenFeedbackTitle } from "./feedbackDialog";
import { submitFeedback } from "./feedback";

const FeedbackDialog = lazy(() => import("@optcg/site-legal/FeedbackDialog").then((m) => ({ default: m.FeedbackDialog })));

export function FeedbackHost() {
  const title = useOpenFeedbackTitle();
  if (title === null) return null;
  return (
    <Suspense fallback={null}>
      <FeedbackDialog title={title} submit={(payload) => submitFeedback(payload)} onClose={closeFeedback} />
    </Suspense>
  );
}
