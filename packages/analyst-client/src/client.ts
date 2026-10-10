/** Requests to the analyst service (chat and match reviews) and to the API's chat history. */
import { parseCitations, type Citation, type PlacedCitation } from "./citations";
import type { HintContext } from "./ask";
import { parseProposal, type DeckEditProposal } from "./proposals";
import type { SessionManager } from "./session";
import { SseHttpError, streamSse } from "./sse";

export type DeckContext = {
  name: string;
  leaderId: string | null;
  cards: { id: string; copies: number }[];
  /** Which saved deck this is ("planner:<id>" or "duel:<id>"), so a suggested edit knows where it applies. */
  ref?: string;
  plannerDeckId?: number;
};

/** A card on a board as the analyst sees it. `id` is the instance id; `defId` the printed card number. */
export type SnapCard = {
  id: string;
  defId: string;
  rested?: boolean;
  don?: number;
  power?: number;
  cost?: number;
  sick?: boolean;
  rush?: boolean;
  status?: string[];
};

/** One legal move, compacted from the game server's legal intents. */
export type LegalAction =
  | { type: "play_card"; card: string; trash?: string }
  | { type: "give_don"; target: string }
  | { type: "activate_ability"; source: string; abilityId: string; target?: string }
  | { type: "declare_attack"; attacker: string; target: string }
  | { type: "declare_block"; blocker: string }
  | { type: "pass_block" }
  | { type: "counter_from_hand" | "counter_event"; card: string }
  | { type: "pass_counter" }
  | { type: "end_turn" };

/** What one seat can see of a game: never the opponent's hand, only a count. */
export type GameSnapshot = {
  seat: 0 | 1;
  turn: number;
  phase: string;
  yourTurn: boolean;
  you: {
    leader: SnapCard;
    characters: SnapCard[];
    stage: SnapCard | null;
    hand: { id: string; defId: string; cost?: number; counter?: number }[];
    deck: number;
    life: number;
    faceUpLife: string[];
    trash: string[];
    donActive: number;
    donRested: number;
    donDeck: number;
  };
  opponent: {
    leader: SnapCard;
    characters: SnapCard[];
    stage: SnapCard | null;
    hand: number;
    deck: number;
    life: number;
    faceUpLife: string[];
    trash: string[];
    donActive: number;
    donTotal: number;
    donDeck: number;
  };
  battle?: string | null;
  choice?: { prompt: string; kind: string } | null;
  legal: LegalAction[];
};

/** The live game sent with a message: the brief ticket proves an unranked room, the analyst checks it again. */
export type GameChatContext = { ticket: string; snapshot: GameSnapshot; log?: string[] };

/** What the page the user is on adds to a message. */
export type ChatContext = { page?: string; deck?: DeckContext; matchId?: string; hint?: HintContext; game?: GameChatContext };

export type ChatRequest = { thread_id?: number; message: string; context?: ChatContext };
export type ReviewRequest = { match_id: string; regenerate?: boolean };
/** A matchup brief: the game server's ticket, and whether to write one when none is saved (false only looks). */
export type BriefRequest = { ticket: string; generate: boolean };

/** One step of a turn plan Log Pose proposes. `label` is written by the analyst from the board, not by the model. */
export type PlanStep = { label: string; why?: string } & (
  | { action: "play"; card: string; trash?: string }
  | { action: "give_don"; target: string; count: number }
  | { action: "activate"; source: string; abilityId?: string; target?: string }
  | { action: "attack"; attacker: string; target: string }
  | { action: "end_turn" }
);

export type TurnPlan = {
  /** The tool call's id. */
  id: string;
  /** The game turn the plan was made for. */
  turn: number;
  summary: string;
  steps: PlanStep[];
  /** The game (its ticket's match key) the plan was made for, stamped when the answer arrives. Card ids only mean something in that game. */
  gameKey?: string;
};

/**
 * The game a brief ticket was minted for: its `mid` claim (the match, or `match-rN` for a rematch). It is the same
 * across the fresh tickets a reconnect brings and differs per game. An unreadable ticket stands for itself.
 */
export function ticketGameKey(ticket: string): string {
  try {
    const body = ticket.split(".")[1] ?? "";
    const json = atob(body.replace(/-/g, "+").replace(/_/g, "/"));
    const mid = (JSON.parse(json) as { mid?: unknown }).mid;
    return typeof mid === "string" && mid ? mid : ticket;
  } catch {
    return ticket;
  }
}

/** Ties a plan to the game its message was sent for, so a later game never plays it. No game context, no stamp. */
export function stampPlan(plan: TurnPlan, context: ChatContext | undefined): TurnPlan {
  const ticket = context?.game?.ticket;
  return ticket ? { ...plan, gameKey: ticketGameKey(ticket) } : plan;
}

export const PLAN_LIMITS = { summary: 300, label: 200, why: 400, id: 40, steps: 15, count: 10 };

const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const optStr = (v: unknown, max: number): string | undefined => str(v, max) ?? undefined;

function parseStep(raw: unknown): PlanStep | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const label = str(o.label, PLAN_LIMITS.label);
  if (!label) return null;
  const base = { label, ...(optStr(o.why, PLAN_LIMITS.why) ? { why: optStr(o.why, PLAN_LIMITS.why) } : {}) };
  const id = (v: unknown) => str(v, PLAN_LIMITS.id);
  switch (o.action) {
    case "play": {
      const card = id(o.card);
      const trash = id(o.trash);
      return card ? { ...base, action: "play", card, ...(trash ? { trash } : {}) } : null;
    }
    case "give_don": {
      const target = id(o.target);
      const count = o.count;
      if (!target || typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > PLAN_LIMITS.count) return null;
      return { ...base, action: "give_don", target, count };
    }
    case "activate": {
      const source = id(o.source);
      const abilityId = id(o.abilityId);
      const target = id(o.target);
      return source ? { ...base, action: "activate", source, ...(abilityId ? { abilityId } : {}), ...(target ? { target } : {}) } : null;
    }
    case "attack": {
      const attacker = id(o.attacker);
      const target = id(o.target);
      return attacker && target ? { ...base, action: "attack", attacker, target } : null;
    }
    case "end_turn":
      return { ...base, action: "end_turn" };
    default:
      return null;
  }
}

/**
 * A turn plan from a `plan` event, or null when it is unusable. One bad step drops the whole plan: a plan with a
 * hole in it (a missing Play before its Attack) must never run.
 */
export function parseTurnPlan(raw: unknown): TurnPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = str(o.id, PLAN_LIMITS.id);
  const summary = str(o.summary, PLAN_LIMITS.summary);
  if (!id || !summary || typeof o.turn !== "number" || !Number.isInteger(o.turn) || o.turn < 0) return null;
  if (!Array.isArray(o.steps) || o.steps.length < 1 || o.steps.length > PLAN_LIMITS.steps) return null;
  const steps: PlanStep[] = [];
  for (const s of o.steps) {
    const step = parseStep(s);
    if (!step) return null;
    steps.push(step);
  }
  return { id, turn: o.turn, summary, steps };
}

export type ErrorCode = "credit" | "daily" | "monthly" | "busy" | "auth" | "server" | "bad_request";
export type DonePayload = {
  thread_id?: number;
  cost_usd?: number;
  spent_today_usd?: number;
  daily_cap_usd?: number;
  /** The player's monthly credit after this answer (null for an owner), what they have used and the limit that now stops them. */
  credit_usd?: number | null;
  credit_spent_usd?: number;
  refusal?: "credit" | "daily" | "monthly" | null;
  saved?: boolean;
  /** A brief served from the saved copy (free). */
  cached?: boolean;
};

export type StreamHandlers = {
  onThread?: (threadId: number) => void;
  onStatus?: (text: string) => void;
  onText?: (delta: string) => void;
  /** Sources cited by the text streamed so far: place their markers at its current end. */
  onCite?: (citations: Citation[]) => void;
  /** A deck edit Log Pose suggests for the open deck, to show as an Apply card under the answer. */
  onProposal?: (proposal: DeckEditProposal) => void;
  /** A turn plan Log Pose proposes for the live game, to show as a Turn plan card under the answer. */
  onPlan?: (plan: TurnPlan) => void;
  onDone?: (done: DonePayload) => void;
  /** An `error` event inside the stream. */
  onError?: (err: { message: string; code?: ErrorCode }) => void;
};

export const CREDIT_MESSAGE = "You've used this month's free Log Pose credit.";
export const DAILY_MESSAGE = "You've hit today's Log Pose limit. It's back at midnight UTC.";
export const MONTHLY_MESSAGE = "Log Pose is resting until the 1st.";
export const BUSY_MESSAGE = "Log Pose is still answering your other question. Try again in a moment.";
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
  if (err.code === "credit") return CREDIT_MESSAGE;
  if (err.code === "daily") return DAILY_MESSAGE;
  if (err.code === "monthly") return MONTHLY_MESSAGE;
  if (err.code === "busy") return BUSY_MESSAGE;
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
  } else if (event === "plan") {
    const plan = parseTurnPlan(d);
    if (plan) handlers.onPlan?.(plan);
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

/** Which limit a 429 body names; a 429 that names none is taken as the daily one. */
export function limitCode(body: string): "credit" | "daily" | "monthly" | "busy" {
  try {
    const code = (JSON.parse(body) as { code?: unknown }).code;
    if (code === "credit" || code === "daily" || code === "monthly" || code === "busy") return code;
  } catch {
    /* not JSON */
  }
  return "daily";
}

/**
 * POSTs `body` to {chat_url}{path} with the session token and streams the answer into
 * `handlers`. A 401 before the stream starts refreshes the session and retries once;
 * 429 throws the error for the limit the analyst names (credit, daily or monthly); any other status throws a generic error.
 */
export async function streamAnalyst(
  session: SessionManager,
  path: "/chat" | "/review-match" | "/brief",
  body: ChatRequest | ReviewRequest | BriefRequest,
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
      if (e.status === 429) {
        const code = limitCode(e.body);
        throw new AnalystError(code, errorText({ code }));
      }
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

/** DELETE {apiBase}/analyst/chat/threads/{id}: the player deletes a chat. What it cost stays in the totals. */
export async function deleteThread(apiBase: string, threadId: number, fetchImpl: typeof fetch = fetch): Promise<void> {
  const res = await fetchImpl(`${apiBase}/analyst/chat/threads/${threadId}`, { method: "DELETE", credentials: "include" });
  if (!res.ok && res.status !== 404) throw new Error("Couldn't delete that chat. Try again in a moment.");
}
