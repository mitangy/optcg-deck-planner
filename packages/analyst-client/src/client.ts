import { parseCitations, type Citation, type PlacedCitation } from "./citations";
import { PLAN_ABILITY_ID_MAX, PLAN_STEP_ID_MAX, isLimitCode, type DonePayload, type ErrorCode, type HintContext, type LimitCode } from "@optcg/analyst-contract";
import { parseDraft, type NewDeckDraft } from "./drafts";
import { parseProposal, type DeckEditProposal } from "./proposals";
import type { SessionManager } from "./session";
import { SseHttpError, streamSse } from "./sse";

export type DeckContext = {
  name: string;
  leaderId: string | null;
  cards: { id: string; copies: number }[];
  ref?: string;
  plannerDeckId?: number;
};

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

export type GameSnapshot = {
  seat: 0 | 1;
  turn: number;
  phase: string;
  yourTurn: boolean;
  first?: boolean;
  mulliganDone?: boolean;
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
  choice?: PendingChoiceSnap | null;
  legal: LegalAction[];
};

export type ChoiceOptionSnap = { id: string; defId?: string; label?: string; inst?: string; zone?: string; owner?: "you" | "opponent"; eligible: boolean };

export type ChoiceRequestSnap = {
  type: "confirm" | "select" | "mode" | "order" | "look";
  min?: number;
  max?: number;
  options?: ChoiceOptionSnap[];
  allowTopOrBottom?: boolean;
  distinctNames?: boolean;
  rest?: string;
  truncated?: boolean;
};

export type PendingChoiceSnap = {
  id?: string;
  prompt: string;
  kind: string;
  optional?: boolean;
  declineOnly?: boolean;
  request?: ChoiceRequestSnap;
};

export const CHOICE_OPTION_LIMIT = 40;

export type GameChatContext = { ticket: string; snapshot: GameSnapshot; log?: string[];
  plans?: boolean;
  autopilot?: boolean;
};

export type ChatContext = { page?: string; deck?: DeckContext; matchId?: string; hint?: HintContext; game?: GameChatContext };

export type ChatRequest = { thread_id?: number; message: string; context?: ChatContext; scope?: string; scope_title?: string };
export type ReviewRequest = { match_id: string; regenerate?: boolean };
export type BriefRequest = { ticket: string; generate: boolean };

export type PlanStep = { label: string; why?: string } & (
  | { action: "play"; card: string; trash?: string }
  | { action: "give_don"; target: string; count: number }
  | { action: "activate"; source: string; abilityId?: string; target?: string }
  | { action: "attack"; attacker: string; target: string }
  | { action: "end_turn" }
);

export type TurnPlan = {
  id: string;
  turn: number;
  summary: string;
  steps: PlanStep[];
  autoplay?: boolean;
  /** Card ids only mean something in the game the plan was made for. */
  gameKey?: string;
};

// Same across the fresh tickets a reconnect brings, different per game.
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

// A later game must never play an earlier game's plan.
export function stampPlan(plan: TurnPlan, context: ChatContext | undefined): TurnPlan {
  const ticket = context?.game?.ticket;
  return ticket ? { ...plan, gameKey: ticketGameKey(ticket) } : plan;
}

export const PLAN_LIMITS = { summary: 300, label: 200, why: 400, id: PLAN_STEP_ID_MAX, abilityId: PLAN_ABILITY_ID_MAX, steps: 15, count: 10 };

const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const optStr = (v: unknown, max: number): string | undefined => str(v, max) ?? undefined;

function parseStep(raw: unknown): PlanStep | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const label = str(o.label, PLAN_LIMITS.label);
  if (!label) return null;
  const base = { label, ...(optStr(o.why, PLAN_LIMITS.why) ? { why: optStr(o.why, PLAN_LIMITS.why) } : {}) };
  // An id cut short names a different card or ability, so a step whose id is over the limit is invalid (the
  // plan is dropped), never shortened. A missing optional id is still just absent.
  const tooLong = (v: unknown, max: number) => typeof v === "string" && v.trim().length > max;
  for (const key of ["card", "trash", "target", "source", "attacker"]) if (tooLong(o[key], PLAN_LIMITS.id)) return null;
  if (tooLong(o.abilityId, PLAN_LIMITS.abilityId)) return null;
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
      const abilityId = str(o.abilityId, PLAN_LIMITS.abilityId);
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

// One bad step drops the whole plan: a plan with a hole in it (a missing Play before its Attack) must never run.
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
  return { id, turn: o.turn, summary, steps, ...(o.autoplay === true ? { autoplay: true } : {}) };
}

export type ChoiceAnswer = {
  id: string;
  choiceId: string;
  accept: boolean;
  selectedOptionIds?: string[];
  orderedOptionIds?: string[];
  topOptionIds?: string[];
  summary: string;
  gameKey?: string;
};

export const CHOICE_LIMITS = { id: 80, summary: 200, options: CHOICE_OPTION_LIMIT };

const ids = (v: unknown): string[] | undefined | null => {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length > CHOICE_LIMITS.options) return null;
  const out: string[] = [];
  for (const x of v) {
    const id = str(x, CHOICE_LIMITS.id);
    if (!id) return null;
    out.push(id);
  }
  return out;
};

export function parseChoiceAnswer(raw: unknown): ChoiceAnswer | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = str(o.id, CHOICE_LIMITS.id);
  const choiceId = str(o.choiceId, CHOICE_LIMITS.id);
  if (!id || !choiceId || typeof o.accept !== "boolean") return null;
  const selected = ids(o.selectedOptionIds);
  const ordered = ids(o.orderedOptionIds);
  const top = ids(o.topOptionIds);
  if (selected === null || ordered === null || top === null) return null;
  return {
    id,
    choiceId,
    accept: o.accept,
    ...(selected ? { selectedOptionIds: selected } : {}),
    ...(ordered ? { orderedOptionIds: ordered } : {}),
    ...(top ? { topOptionIds: top } : {}),
    summary: str(o.summary, CHOICE_LIMITS.summary) ?? (o.accept ? "Answered" : "Declined"),
  };
}

export function stampChoice(answer: ChoiceAnswer, context: ChatContext | undefined): ChoiceAnswer {
  const ticket = context?.game?.ticket;
  return ticket ? { ...answer, gameKey: ticketGameKey(ticket) } : answer;
}

export const AUTO_PREFIX = "(auto) ";
export const isAutoMessage = (text: string): boolean => text.startsWith(AUTO_PREFIX);
export const autoText = (text: string): string => (isAutoMessage(text) ? text.slice(AUTO_PREFIX.length) : text);

export type { DonePayload, ErrorCode };

export type StreamHandlers = {
  onThread?: (threadId: number) => void;
  onStatus?: (text: string) => void;
  onText?: (delta: string) => void;
  onCite?: (citations: Citation[]) => void;
  onProposal?: (proposal: DeckEditProposal) => void;
  onDraft?: (draft: NewDeckDraft) => void;
  onPlan?: (plan: TurnPlan) => void;
  onChoice?: (answer: ChoiceAnswer) => void;
  onDone?: (done: DonePayload) => void;
  onError?: (err: { message: string; code?: ErrorCode }) => void;
};

export const CREDIT_MESSAGE = "You've used this month's free Log Pose credit.";
export const DAILY_MESSAGE = "You've hit today's Log Pose limit. It's back at midnight UTC.";
export const MONTHLY_MESSAGE = "Log Pose is resting until the 1st.";
export const BUSY_MESSAGE = "Log Pose is still answering your other question. Try again in a moment.";
export const GENERIC_ERROR = "Log Pose couldn't answer just now. Try again in a moment.";
export const AUTH_ERROR = "Log Pose needs you to sign in again.";

export class AnalystError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AnalystError";
  }
}

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
  } else if (event === "deck_draft") {
    const draft = parseDraft(d);
    if (draft) handlers.onDraft?.(draft);
  } else if (event === "plan") {
    const plan = parseTurnPlan(d);
    if (plan) handlers.onPlan?.(plan);
  } else if (event === "choice") {
    const answer = parseChoiceAnswer(d);
    if (answer) handlers.onChoice?.(answer);
  } else if (event === "done") handlers.onDone?.(d as DonePayload);
  else if (event === "error")
    handlers.onError?.({ message: typeof d.message === "string" ? d.message : "", code: d.code as ErrorCode | undefined });
}

function refusalReason(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    return typeof parsed.error === "string" && parsed.error.trim() ? parsed.error.trim().slice(0, 300) : null;
  } catch {
    return null;
  }
}

export function limitCode(body: string): LimitCode {
  try {
    const code = (JSON.parse(body) as { code?: unknown }).code;
    if (isLimitCode(code)) return code;
  } catch {
    /* not JSON */
  }
  return "daily";
}

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

export type ThreadMessage = { role: "user" | "assistant"; text: string; citations?: PlacedCitation[]; proposals?: DeckEditProposal[]; drafts?: NewDeckDraft[] };
export type ThreadHistory = { id: number; title: string; scope?: string; messages: ThreadMessage[] };

export type ThreadSummary = { id: number; title: string; updated_at: string; scope: string };

export async function listThreads(apiBase: string, scope?: string, fetchImpl: typeof fetch = fetch): Promise<ThreadSummary[]> {
  const q = scope ? `?scope=${encodeURIComponent(scope)}` : "";
  const res = await fetchImpl(`${apiBase}/analyst/chat/threads${q}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Could not list your chats (${res.status})`);
  const body = (await res.json()) as { threads?: unknown };
  const rows = Array.isArray(body.threads) ? body.threads : [];
  return rows.flatMap((r): ThreadSummary[] => {
    const t = r as Partial<ThreadSummary> | null;
    if (!t || typeof t.id !== "number" || !Number.isInteger(t.id)) return [];
    return [{ id: t.id, title: typeof t.title === "string" ? t.title : "", updated_at: typeof t.updated_at === "string" ? t.updated_at : "", scope: typeof t.scope === "string" ? t.scope : "general" }];
  });
}

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
      drafts: (Array.isArray(m.drafts) ? m.drafts : []).map(parseDraft).filter((d): d is NewDeckDraft => d !== null),
    })),
  };
}

export type SavedReview = { match_id: string; text: string; citations: PlacedCitation[]; created_at: string };

export async function fetchSavedReview(apiBase: string, matchId: string, fetchImpl: typeof fetch = fetch): Promise<SavedReview | null> {
  const res = await fetchImpl(`${apiBase}/analyst/reviews/${encodeURIComponent(matchId)}`, { credentials: "include" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not load the review (${res.status})`);
  const body = (await res.json()) as SavedReview;
  return { ...body, citations: parseCitations(body.citations, true) };
}

export async function deleteThread(apiBase: string, threadId: number, fetchImpl: typeof fetch = fetch): Promise<void> {
  const res = await fetchImpl(`${apiBase}/analyst/chat/threads/${threadId}`, { method: "DELETE", credentials: "include" });
  if (!res.ok && res.status !== 404) throw new Error("Couldn't delete that chat. Try again in a moment.");
}
