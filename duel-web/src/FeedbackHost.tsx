import { FeedbackDialog } from "@optcg/site-legal";
import { closeFeedback, useOpenFeedbackTitle } from "./feedbackDialog";
import { submitFeedback } from "./feedback";

/** Renders the open feedback dialog over whatever page (or match) is showing. */
export function FeedbackHost() {
  const title = useOpenFeedbackTitle();
  if (title === null) return null;
  return <FeedbackDialog title={title} submit={(payload) => submitFeedback(payload)} onClose={closeFeedback} />;
}
