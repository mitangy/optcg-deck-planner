/** Rating a Log Pose answer: thumbs up, thumbs down, or "This is wrong" with a note (#679). Requests and vote state, no UI. */

export const NOTE_MAX = 1000;
export type Rating = "up" | "down" | "wrong";

/** What is being rated: a chat answer (the n-th saved answer of a thread) or a match review. */
export type FeedbackTarget = { kind: "chat"; threadId: number; index: number; startsWith: string } | { kind: "review"; matchId: string };

export type Vote = { rating: Rating; note: string };

/** The key a vote is kept under in the panel, the same one the server builds for its one-row-per-answer rule. */
export function targetKey(t: FeedbackTarget): string {
  return t.kind === "chat" ? `chat:${t.threadId}:${t.index}` : `review:${t.matchId}`;
}

/** The start of an answer the server checks against its stored copy, so a drifted index is refused instead of rating another answer. */
export function answerStart(text: string): string {
  return text.trim().replace(/\s+/g, " ").slice(0, 40);
}

/** Only "wrong" carries a note; it is trimmed and cut to the limit. */
export function cleanNote(rating: Rating, note: string): string {
  return rating === "wrong" ? note.trim().slice(0, NOTE_MAX) : "";
}

export function feedbackBody(t: FeedbackTarget, rating: Rating, note: string): Record<string, unknown> {
  const base = { rating, note: cleanNote(rating, note) };
  return t.kind === "chat"
    ? { kind: "chat", thread_id: t.threadId, message_index: t.index, starts_with: t.startsWith, ...base }
    : { kind: "review", match_id: t.matchId, ...base };
}

export const FEEDBACK_ERROR = "Couldn't send that. Try again in a moment.";
export const FEEDBACK_BUSY = "Too many ratings just now. Try again in a minute.";

/** POST {apiBase}/analyst/feedback. A later vote on the same answer replaces the first. Throws an Error with the text to show. */
export async function postFeedback(apiBase: string, t: FeedbackTarget, rating: Rating, note: string, fetchImpl: typeof fetch = fetch): Promise<Vote> {
  let res: Response;
  try {
    res = await fetchImpl(`${apiBase}/analyst/feedback`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(feedbackBody(t, rating, note)),
    });
  } catch {
    throw new Error(FEEDBACK_ERROR);
  }
  if (res.status === 429) throw new Error(FEEDBACK_BUSY);
  if (!res.ok) throw new Error(FEEDBACK_ERROR);
  return { rating, note: cleanNote(rating, note) };
}

type StoredVote = { kind?: unknown; rating?: unknown; note?: unknown; message_index?: unknown; match_id?: unknown; thread_id?: unknown };
const isRating = (r: unknown): r is Rating => r === "up" || r === "down" || r === "wrong";

/** The player's own votes on a thread's answers or on one game's review, by target key. Empty when there is nothing or it can't be read. */
export async function fetchVotes(apiBase: string, scope: { threadId: number } | { matchId: string }, fetchImpl: typeof fetch = fetch): Promise<Map<string, Vote>> {
  const query = "threadId" in scope ? `thread_id=${scope.threadId}` : `match_id=${encodeURIComponent(scope.matchId)}`;
  const out = new Map<string, Vote>();
  try {
    const res = await fetchImpl(`${apiBase}/analyst/feedback?${query}`, { credentials: "include" });
    if (!res.ok) return out;
    const body = (await res.json()) as { votes?: StoredVote[] };
    for (const v of Array.isArray(body.votes) ? body.votes : []) {
      if (!isRating(v.rating)) continue;
      const vote: Vote = { rating: v.rating, note: typeof v.note === "string" ? v.note : "" };
      if (v.kind === "chat" && typeof v.thread_id === "number" && typeof v.message_index === "number") out.set(`chat:${v.thread_id}:${v.message_index}`, vote);
      else if (v.kind === "review" && typeof v.match_id === "string") out.set(`review:${v.match_id}`, vote);
    }
  } catch {
    /* the buttons simply start unselected */
  }
  return out;
}

/** The note form: what the "This is wrong" control is doing. */
export type WrongForm = { open: boolean; note: string; sending: boolean; error: string | null };
export const CLOSED_FORM: WrongForm = { open: false, note: "", sending: false, error: null };

export type FormAction =
  | { type: "open"; note: string }
  | { type: "close" }
  | { type: "note"; note: string }
  | { type: "sending" }
  | { type: "failed"; error: string }
  | { type: "sent" };

export function formReducer(s: WrongForm, a: FormAction): WrongForm {
  switch (a.type) {
    case "open":
      return { open: true, note: a.note.slice(0, NOTE_MAX), sending: false, error: null };
    case "close":
      // A send in flight can't be cancelled away.
      return s.sending ? s : CLOSED_FORM;
    case "note":
      return s.sending ? s : { ...s, note: a.note.slice(0, NOTE_MAX), error: null };
    case "sending":
      return { ...s, sending: true, error: null };
    case "failed":
      return { ...s, sending: false, error: a.error };
    case "sent":
      return CLOSED_FORM;
  }
}

/** The status line under the buttons: empty until a vote is saved. Fixed text so the slot's size doesn't depend on the rating. */
export function statusText(vote: Vote | undefined, error: string | null, sending: boolean): string {
  if (error) return error;
  if (sending) return "Sending…";
  if (!vote) return "";
  return "Thanks";
}
