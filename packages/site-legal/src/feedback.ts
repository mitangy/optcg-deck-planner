/** Shared by the planner and duel-web "Send feedback" dialogs: limits mirror the API. */

export type FeedbackKind = "bug" | "idea" | "other";

export const FEEDBACK_KINDS: readonly { id: FeedbackKind; label: string }[] = [
  { id: "bug", label: "Problem" },
  { id: "idea", label: "Idea" },
  { id: "other", label: "Other" },
];

export const MIN_FEEDBACK_LENGTH = 10;
export const MAX_FEEDBACK_LENGTH = 2000;
const MAX_USER_AGENT = 300;
const MAX_PAGE = 200;

/** What the dialog collects; each app adds its own app / build / room fields before posting. */
export type FeedbackPayload = {
  kind: FeedbackKind;
  message: string;
  /** Path only, never the query string or hash (share tokens live there). */
  page: string;
  /** "390x844" (CSS pixels). */
  viewport: string;
  user_agent: string;
};

/** A message to show when the text is not usable, else null. Length is of the trimmed text, like the API. */
export function feedbackMessageError(message: string): string | null {
  const len = message.trim().length;
  if (len < MIN_FEEDBACK_LENGTH) return `Tell us a bit more (at least ${MIN_FEEDBACK_LENGTH} characters).`;
  if (len > MAX_FEEDBACK_LENGTH) return `Keep it under ${MAX_FEEDBACK_LENGTH} characters.`;
  return null;
}

/** Share and group-buy links carry a secret token in the path: keep the route, drop the token. */
export function scrubPath(pathname: string): string {
  return pathname.replace(/^(\/(?:share|group-buy\/(?:join|view))\/)[^/]+/, "$1:token");
}

type Env = { pathname: string; innerWidth: number; innerHeight: number; userAgent: string };

function browserEnv(): Env {
  if (typeof window === "undefined") return { pathname: "", innerWidth: 0, innerHeight: 0, userAgent: "" };
  return {
    pathname: window.location.pathname,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
  };
}

export function buildFeedbackPayload(kind: FeedbackKind, message: string, env: Env = browserEnv()): FeedbackPayload {
  return {
    kind,
    message: message.trim(),
    page: scrubPath(env.pathname).slice(0, MAX_PAGE),
    viewport: `${Math.round(env.innerWidth)}x${Math.round(env.innerHeight)}`,
    user_agent: env.userAgent.slice(0, MAX_USER_AGENT),
  };
}

/** Wire form every app posts: the shared payload plus the app's own context. */
export function feedbackRequestBody(
  payload: FeedbackPayload,
  extra: { app: "duel" | "planner"; client_build: string; room_id?: string },
): string {
  return JSON.stringify({ ...payload, ...extra, room_id: extra.room_id ?? "" });
}

/** User-facing error for a failed POST; 429 gets its own wording. */
export function feedbackErrorMessage(status: number): string {
  if (status === 429) return "You've sent a lot of feedback. Try again in a few minutes.";
  return `Could not send feedback (${status}). Try again.`;
}
