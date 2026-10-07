/** Requests to the analyst service (chat and match reviews) and to the API's chat history. */
import { parseCitations, type Citation, type PlacedCitation } from "./citations";
import { parseProposal, type DeckEditProposal } from "./proposals";
import type { SessionManager } from "./session";
import { SseHttpError, streamSse } from "./sse";

export type DeckContext = {
  name: string;
  leaderId: string | null;
  cards: { id: string; copies: number }[];
  /** Which saved deck this is ("planner:<id>" or "duel:<id>"), so a suggested edit knows where it applies. */
  ref?: string;
};
/** What the page the user is on adds to a message. */
export type ChatContext = { page?: string; deck?: DeckContext; matchId?: string };

export type ChatRequest = { thread_id?: number; message: string; context?: ChatContext };
export type ReviewRequest = { match_id: string; regenerate?: boolean };

export type ErrorCode = "budget" | "auth" | "server";
export type DonePayload = {
  thread_id?: number;
  cost_usd?: number;
  spent_today_usd?: number;
  daily_cap_usd?: number;
  saved?: boolean;
};

export type StreamHandlers = {
  onThread?: (threadId: number) => void;
  onStatus?: (text: string) => void;
  onText?: (delta: string) => void;
  /** Sources cited by the text streamed so far: place their markers at its current end. */
  onCite?: (citations: Citation[]) => void;
  /** A deck edit Log Pose suggests for the open deck, to show as an Apply card under the answer. */
  onProposal?: (proposal: DeckEditProposal) => void;
  onDone?: (done: DonePayload) => void;
  /** An `error` event inside the stream. */
  onError?: (err: { message: string; code?: ErrorCode }) => void;
};

export const BUDGET_MESSAGE = "Daily Log Pose limit reached. It resets tomorrow.";
export const GENERIC_ERROR = "Log Pose couldn't answer just now. Try again in a moment.";
export const AUTH_ERROR = "Log Pose needs you to sign in again.";

/** Failure before or outside the stream (HTTP status, no session). */
export class AnalystError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AnalystError";
  }
}

/** The text to show for an error event or AnalystError. */
export function errorText(err: { message?: string; code?: string }): string {
  if (err.code === "budget") return BUDGET_MESSAGE;
  if (err.code === "auth") return AUTH_ERROR;
  return err.message?.trim() || GENERIC_ERROR;
}

function dispatch(handlers: StreamHandlers, event: string, data: unknown) {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (event === "thread" && typeof d.thread_id === "number") handlers.onThread?.(d.thread_id);
  else if (event === "status" && typeof d.text === "string") handlers.onStatus?.(d.text);
  else if (event === "text" && typeof d.delta === "string") handlers.onText?.(d.delta);
  else if (event === "cite") {
    const citations = parseCitations(d.citations);
    if (citations.length) handlers.onCite?.(citations);
  } else if (event === "proposal") {
    const proposal = parseProposal(d);
    if (proposal) handlers.onProposal?.(proposal);
  } else if (event === "done") handlers.onDone?.(d as DonePayload);
  else if (event === "error")
    handlers.onError?.({ message: typeof d.message === "string" ? d.message : "", code: d.code as ErrorCode | undefined });
}

/** The analyst's own reason from a JSON refusal ({"error": "..."}), when there is one. */
function refusalReason(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    return typeof parsed.error === "string" && parsed.error.trim() ? parsed.error.trim().slice(0, 300) : null;
  } catch {
    return null;
  }
}

/**
 * POSTs `body` to {chat_url}{path} with the session token and streams the answer into
 * `handlers`. A 401 before the stream starts refreshes the session and retries once;
 * 429 throws the budget error; any other status throws a generic error.
 */
export async function streamAnalyst(
  session: SessionManager,
  path: "/chat" | "/review-match",
  body: ChatRequest | ReviewRequest,
  handlers: StreamHandlers,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const auth = await session.getAuth(attempt > 0);
    if (!auth) throw new AnalystError("auth", AUTH_ERROR);
    try {
      await streamSse(
        `${auth.chatUrl}${path}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json", Accept: "text/event-stream" },
          body: JSON.stringify(body),
          credentials: "omit",
          signal,
        },
        (e) => dispatch(handlers, e.event, e.data),
        fetchImpl,
      );
      return;
    } catch (e) {
      if (!(e instanceof SseHttpError)) throw e;
      if (e.status === 401 && attempt === 0) continue;
      if (e.status === 401) throw new AnalystError("auth", AUTH_ERROR);
      if (e.status === 429) throw new AnalystError("budget", BUDGET_MESSAGE);
      throw new AnalystError("server", refusalReason(e.body) ?? GENERIC_ERROR);
    }
  }
}

export type ThreadMessage = { role: "user" | "assistant"; text: string; citations?: PlacedCitation[]; proposals?: DeckEditProposal[] };
export type ThreadHistory = { id: number; title: string; messages: ThreadMessage[] };

/** GET {apiBase}/analyst/chat/threads/{id}; null when it is gone (404). */
export async function fetchThread(apiBase: string, threadId: number, fetchImpl: typeof fetch = fetch): Promise<ThreadHistory | null> {
  const res = await fetchImpl(`${apiBase}/analyst/chat/threads/${threadId}`, { credentials: "include" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not load the chat (${res.status})`);
  const body = (await res.json()) as ThreadHistory;
  return {
    ...body,
    messages: body.messages.map((m) => ({
      ...m,
      citations: parseCitations(m.citations, true),
      proposals: (Array.isArray(m.proposals) ? m.proposals : []).map(parseProposal).filter((p): p is DeckEditProposal => p !== null),
    })),
  };
}

export type SavedReview = { match_id: string; text: string; citations: PlacedCitation[]; created_at: string };

/** GET {apiBase}/analyst/reviews/{matchId}; null when none is saved yet (404). */
export async function fetchSavedReview(apiBase: string, matchId: string, fetchImpl: typeof fetch = fetch): Promise<SavedReview | null> {
  const res = await fetchImpl(`${apiBase}/analyst/reviews/${encodeURIComponent(matchId)}`, { credentials: "include" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not load the review (${res.status})`);
  const body = (await res.json()) as SavedReview;
  return { ...body, citations: parseCitations(body.citations, true) };
}
