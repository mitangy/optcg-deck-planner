import type { Catalog } from "./catalog";
import { PlannerApiError, plannerCall, tokenIsValid, type PlannerApi } from "./matches";
import { ChatHttpError, refusalError, type Refusal } from "./errors";
import { CHAT_MODEL, modelOf } from "./models";
import type { Usage } from "./types";

export type Budget = {
  allowed: boolean;
  spent_today_usd: number;
  daily_cap_usd: number;
  model?: string;
  /** The limit that stops this player, when one does. */
  refusal?: Refusal | null;
  /** This month's credit (null for an owner), what the player has used of it, and when it refills. */
  credit_usd?: number | null;
  credit_spent_usd?: number;
  credit_resets_at?: string;
};

export type Kind = "chat" | "review" | "brief";


/** One JSON line on stderr, like the other `console.error(JSON.stringify({ event, ... }))` lines, so a log drain can alert on an event name. Never pass secrets or message text. */
function logEvent(event: string, fields: Record<string, unknown>) {
  console.error(JSON.stringify({ event, ...fields }));
}

/** The user id inside a chat token (`chat.<user>.<exp>.<sig>`): safe to log, unlike the token itself. */
const userKey = (token: string) => token.split(".")[1] ?? "unknown";

/** HTTP status of a failed planner call, or null for a network error / timeout. */
const statusOf = (err: unknown): number | null => (err instanceof PlannerApiError ? err.status : null);
const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** The model Log Pose runs on right now (the planner holds the one setting both apps share). A failed lookup means CHAT_MODEL. */
export async function currentModel(api: PlannerApi, token: string): Promise<string> {
  try {
    return modelOf(await plannerCall<Budget>(api, token, "/analyst/chat/budget", true));
  } catch (err) {
    logEvent("model_lookup_failed", { route: "/analyst/chat/budget", status: statusOf(err), user: userKey(token), fallback: CHAT_MODEL, message: errorMessage(err) });
    return CHAT_MODEL;
  }
}

/** Checks the chat token only; throws ChatHttpError before anything is streamed. */
export async function admitToken(api: PlannerApi, token: string | null): Promise<string> {
  if (!token?.startsWith("chat.")) throw new ChatHttpError(401, "Sign in again to use Log Pose.", "auth");
  let valid: boolean;
  try {
    valid = await tokenIsValid(api, token);
  } catch {
    throw new ChatHttpError(503, "Couldn't reach the deck planner. Try again shortly.", "server");
  }
  if (!valid) throw new ChatHttpError(401, "Your Log Pose session expired.", "auth");
  return token;
}

/** Throws the 429 ChatHttpError when the player's credit, today's cap or everyone's monthly cap stops them. A refusal is logged as a $0 usage row. */
export async function checkBudget(api: PlannerApi, token: string, kind: Kind = "chat"): Promise<string> {
  const budget = await plannerCall<Budget>(api, token, "/analyst/chat/budget", true);
  const refusal = budget.refusal ?? (budget.allowed ? null : "daily");
  if (refusal) {
    await recordRefusal(api, token, kind, refusal);
    throw refusalError(refusal);
  }
  return modelOf(budget);
}

/** Checks the chat token and the limits; throws ChatHttpError before anything is streamed. */
export async function admit(api: PlannerApi, token: string | null, kind: Kind = "chat"): Promise<string> {
  const ok = await admitToken(api, token);
  await checkBudget(api, ok, kind);
  return ok;
}

/** How a request went, for the usage log. */
type UsageMeta = { threadId?: number; outcome?: "ok" | "error" | "aborted"; toolCalls?: number; durationMs?: number };

/** Wait before the one retry of a usage write. */
const USAGE_RETRY_DELAY_MS = 250;

/**
 * Writes the usage row; the daily, monthly and credit caps are computed from these rows, so a lost one means
 * undercounting. Retries once after a short pause on a network error or a 5xx (never on a 4xx: the planner
 * said no). If it still fails it logs `usage_record_failed` and returns: the answer is already streamed, so
 * this never throws.
 */
export async function recordUsage(api: PlannerApi, token: string, kind: Kind, usage: Usage, cost: number, model: string = CHAT_MODEL, meta: UsageMeta = {}) {
  const body = {
    kind,
    model,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_read_tokens: usage.cache_read_input_tokens ?? 0,
    cache_write_tokens: usage.cache_creation_input_tokens ?? 0,
    cost_usd: cost,
    ...(meta.threadId ? { thread_id: meta.threadId } : {}),
    outcome: meta.outcome ?? "ok",
    tool_calls: meta.toolCalls ?? 0,
    duration_ms: Math.max(0, Math.round(meta.durationMs ?? 0)),
  };
  for (let attempt = 1; ; attempt++) {
    try {
      await plannerCall(api, token, "/analyst/chat/usage", true, body);
      return;
    } catch (err) {
      const status = statusOf(err);
      const retryable = status === null || status >= 500;
      if (retryable && attempt === 1) {
        await new Promise((r) => setTimeout(r, USAGE_RETRY_DELAY_MS));
        continue;
      }
      logEvent("usage_record_failed", { route: "/analyst/chat/usage", status, user: userKey(token), kind, model, cost_usd: cost, outcome: body.outcome, attempts: attempt, message: errorMessage(err) });
      return;
    }
  }
}

/** A request turned away: a $0 row saying why, so "who ran out and when" is a query. Never blocks the refusal itself. */
export async function recordRefusal(api: PlannerApi, token: string, kind: Kind, refusal: Refusal | "busy", threadId?: number) {
  await plannerCall(api, token, "/analyst/chat/usage", true, {
    kind,
    cost_usd: 0,
    outcome: "refused",
    refusal,
    ...(threadId ? { thread_id: threadId } : {}),
  }).catch((err) => logEvent("refusal_record_failed", { route: "/analyst/chat/usage", status: statusOf(err), user: userKey(token), kind, refusal, message: errorMessage(err) }));
}

/**
 * The limit that stops the player now, counting `extra` dollars an unsaved answer has cost so far; null when none.
 * Deliberately FAILS OPEN when the planner can't answer: the player keeps their answer and a cap can be overshot
 * by one turn's tool rounds. The owner has not decided to fail closed. Every fail-open is logged as
 * `refusal_check_failed_open` so it can be alerted on.
 */
export async function refusalNow(api: PlannerApi, token: string, extra: number): Promise<Refusal | null> {
  try {
    const budget = await plannerCall<Budget>(api, token, `/analyst/chat/budget?extra=${extra.toFixed(6)}`, true);
    return budget.refusal ?? null;
  } catch (err) {
    logEvent("refusal_check_failed_open", { route: "/analyst/chat/budget", status: statusOf(err), user: userKey(token), extra_usd: extra, message: errorMessage(err) });
    return null;
  }
}

/** Streams running per user. Two are allowed (a review beside the chat panel, or a new review as an aborted one winds down); more would let parallel requests all pass the spend-cap check. */
const MAX_STREAMS_PER_USER = 2;
const streaming = new Map<string, number>();

/** Claims one of the user's streams (the token's user id; admit has checked its signature). Returns the release. */
export async function claimStream(api: PlannerApi, token: string, kind: Kind): Promise<() => void> {
  const user = token.split(".")[1] ?? token;
  const running = streaming.get(user) ?? 0;
  if (running >= MAX_STREAMS_PER_USER) {
    await recordRefusal(api, token, kind, "busy");
    throw new ChatHttpError(429, "Log Pose is still answering your other questions. Wait for one to finish.", "busy");
  }
  streaming.set(user, running + 1);
  return () => {
    const left = (streaming.get(user) ?? 1) - 1;
    if (left > 0) streaming.set(user, left);
    else streaming.delete(user);
  };
}
