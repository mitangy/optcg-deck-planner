/**
 * The Log Pose wire contract, defined once: what the analyst service (`analyst/`), the planner and duel-web client
 * (`packages/analyst-client`) and the API (`backend/app`) must agree on. No dependencies, so every side can import it.
 * The backend keeps its own Python copies of the values listed in `fixtures/backend-values.json`; the contract tests
 * in this package and `backend/tests/test_analyst_contract.py` both read that file, so a drift on either side fails.
 */

/** Every model id Log Pose uses (the analyst's evals take their judge and extractor models from here too). */
export const MODELS = { sonnet: "claude-sonnet-5-5", opus: "claude-opus-5-5", haiku: "claude-haiku-5-5", haiku45: "claude-haiku-4-5" } as const;

/** The models the planner's model setting may pick, default first. The API's allow-list (`CHAT_MODELS`) is the same list. */
export const CHAT_MODEL_IDS: readonly string[] = [MODELS.sonnet, MODELS.opus, MODELS.haiku, MODELS.haiku45];

/** Why a request is refused before or while an answer is written: the player's credit is used up, today's cap, or the month's cap. */
export const REFUSAL_CODES = ["credit", "daily", "monthly"] as const;
export type RefusalCode = (typeof REFUSAL_CODES)[number];
export const isRefusalCode = (code: unknown): code is RefusalCode => REFUSAL_CODES.includes(code as RefusalCode);

/** A 429 names one of the refusals, or "busy" (too many answers at once). The API records the same four on a refused usage row. */
export const LIMIT_CODES = [...REFUSAL_CODES, "busy"] as const;
export type LimitCode = (typeof LIMIT_CODES)[number];
export const isLimitCode = (code: unknown): code is LimitCode => LIMIT_CODES.includes(code as LimitCode);

/** The `code` of an error event or a refused chat request. */
export type ErrorCode = LimitCode | "auth" | "server" | "bad_request";

/** The events of a chat stream. */
export const SSE_EVENTS = ["thread", "status", "text", "cite", "proposal", "deck_draft", "plan", "choice", "done", "error"] as const;
export type SseEventName = (typeof SSE_EVENTS)[number];

/**
 * What a Log Pose chat is about: general | match:<id> | deck:planner:<digits> | deck:duel:<id>. The regex source is
 * written so that JavaScript and Python (the API's `ANALYST_SCOPE_PATTERN`) read it the same way.
 */
export const SCOPE_PATTERN_SOURCE = "^(general|match:[A-Za-z0-9_-]{1,64}|deck:planner:[0-9]{1,12}|deck:duel:[A-Za-z0-9_-]{1,64})$";
export const SCOPE_PATTERN = new RegExp(SCOPE_PATTERN_SOURCE);
/** The longest `scope_title` the analyst takes. */
export const SCOPE_TITLE_MAX = 80;

/** A build hint the player tapped "Why?" on, as sent in the chat context. */
export type HintContext = { id: string; tier: "rule" | "shape" | "synergy"; title: string; detail: string; cardIds?: string[] };
/** The analyst answers 400 to a hint past these limits (its zod schema reads them), so the client cuts to them. */
export const HINT_LIMITS = { id: 80, title: 200, detail: 600, cards: 20 };
/** The longest card id in a hint's `cardIds`. */
export const HINT_CARD_ID_MAX = 20;

/** The `done` event: what the answer cost and the player's credit and limits afterwards. */
export type DonePayload = {
  thread_id?: number;
  cost_usd?: number;
  spent_today_usd?: number;
  daily_cap_usd?: number;
  /** The player's monthly credit after this answer (null for an owner), what they have used and the limit that now stops them. */
  credit_usd?: number | null;
  credit_spent_usd?: number;
  refusal?: RefusalCode | null;
  saved?: boolean;
  /** A brief served from the saved copy (free). */
  cached?: boolean;
};
