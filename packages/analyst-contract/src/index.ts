export const MODELS = { sonnet: "claude-sonnet-5-5", opus: "claude-opus-5-5", haiku: "claude-haiku-5-5", haiku45: "claude-haiku-4-5" } as const;

export const CHAT_MODEL_IDS: readonly string[] = [MODELS.sonnet, MODELS.opus, MODELS.haiku, MODELS.haiku45];

export const REFUSAL_CODES = ["credit", "daily", "monthly"] as const;
export type RefusalCode = (typeof REFUSAL_CODES)[number];
export const isRefusalCode = (code: unknown): code is RefusalCode => REFUSAL_CODES.includes(code as RefusalCode);

export const LIMIT_CODES = [...REFUSAL_CODES, "busy"] as const;
export type LimitCode = (typeof LIMIT_CODES)[number];
export const isLimitCode = (code: unknown): code is LimitCode => LIMIT_CODES.includes(code as LimitCode);

export type ErrorCode = LimitCode | "auth" | "server" | "bad_request";

export const SSE_EVENTS = ["thread", "status", "text", "cite", "proposal", "deck_draft", "plan", "choice", "done", "error"] as const;
export type SseEventName = (typeof SSE_EVENTS)[number];

// The regex source is written so JavaScript and Python read it the same way.
export const SCOPE_PATTERN_SOURCE = "^(general|match:[A-Za-z0-9_-]{1,64}|deck:planner:[0-9]{1,12}|deck:duel:[A-Za-z0-9_-]{1,64})$";
export const SCOPE_PATTERN = new RegExp(SCOPE_PATTERN_SOURCE);
export const SCOPE_TITLE_MAX = 80;

export type HintContext = { id: string; tier: "rule" | "shape" | "synergy"; title: string; detail: string; cardIds?: string[] };
/** The analyst answers 400 to a hint past these limits (its zod schema reads them), so the client cuts to them. */
export const HINT_LIMITS = { id: 80, title: 200, detail: 600, cards: 20 };
export const HINT_CARD_ID_MAX = 20;

/**
 * The longest id a turn-plan step may carry (a card, a target...): the analyst's schema caps each at this, and the
 * client drops a plan whose step id is longer instead of cutting it to a different id.
 */
export const PLAN_STEP_ID_MAX = 40;
export const PLAN_ABILITY_ID_MAX = 60;

export type DonePayload = {
  thread_id?: number;
  cost_usd?: number;
  spent_today_usd?: number;
  daily_cap_usd?: number;
  credit_usd?: number | null;
  credit_spent_usd?: number;
  refusal?: RefusalCode | null;
  saved?: boolean;
  cached?: boolean;
};
