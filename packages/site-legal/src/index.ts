// Fan-project footer and legal pages shared by the planner and duel-web. Styles: ./siteLegal.css.
export * from "./content";
export { LegalNav, SiteFooter, type FooterLinkProps } from "./SiteFooter";
export { LegalDocument } from "./LegalDocument";
export { FeedbackDialog } from "./FeedbackDialog";
export {
  FEEDBACK_KINDS,
  MAX_FEEDBACK_LENGTH,
  MIN_FEEDBACK_LENGTH,
  buildFeedbackPayload,
  feedbackErrorMessage,
  feedbackMessageError,
  feedbackRequestBody,
  scrubPath,
  type FeedbackKind,
  type FeedbackPayload,
} from "./feedback";
