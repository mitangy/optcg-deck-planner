import { FeedbackDialog } from "@optcg/site-legal";
import { closeFeedback, useOpenFeedbackTitle } from "./feedbackDialog";
import { submitFeedback } from "./feedback";

export function FeedbackHost() {
  const title = useOpenFeedbackTitle();
  if (title === null) return null;
  return <FeedbackDialog title={title} submit={(payload) => submitFeedback(payload)} onClose={closeFeedback} />;
}
