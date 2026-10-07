/** Asking Log Pose a ready-made question from elsewhere in the app (React-free, so it can be tested in node). */
import type { ChatContext, DeckContext } from "./client";
import type { LogPosePage } from "./LogPose";

/** A build hint, as the deck hints UI shows it. */
export type HintContext = { id: string; tier: "rule" | "shape" | "synergy"; title: string; detail: string; cardIds?: string[] };

export type LogPoseAsk = {
  /** The question, as the player's message (or the composer text when it isn't sent). */
  prompt: string;
  /** Sent with the message, on top of the page's own context. */
  context?: { hint?: HintContext; deck?: DeckContext };
  /** Defaults to true: send it right away instead of filling the composer. */
  send?: boolean;
};

/** Must equal the zod limits of the hint context in analyst/src/chat.ts, or the analyst answers 400. */
export const HINT_LIMITS = { id: 80, title: 200, detail: 600, cards: 20 };
const CARD_ID_MAX = 20;

/** The question for a build hint, with the hint cut to what the analyst accepts. */
export function hintAsk(h: HintContext): LogPoseAsk {
  const title = h.title.slice(0, HINT_LIMITS.title);
  const hint: HintContext = {
    id: h.id.slice(0, HINT_LIMITS.id),
    tier: h.tier,
    title,
    detail: h.detail.slice(0, HINT_LIMITS.detail),
  };
  if (h.cardIds?.length) hint.cardIds = h.cardIds.slice(0, HINT_LIMITS.cards).map((c) => c.slice(0, CARD_ID_MAX));
  return { prompt: `Why does my deck show the “${title}” hint, and what would you change?`, context: { hint } };
}

/** Whether a Why? button can be offered: Log Pose answers for this user and shows on this page. */
export function canAsk(enabled: boolean | null, hidden: boolean): boolean {
  return enabled === true && !hidden;
}

/** Builds the request context: the page id always; the deck / match only while the chip is kept. */
export function messageContext(page: LogPosePage | null, dropped: boolean): ChatContext | undefined {
  if (!page) return undefined;
  const ctx: ChatContext = {};
  if (page.page) ctx.page = page.page;
  if (!dropped) {
    if (page.deck) ctx.deck = page.deck;
    if (page.matchId) ctx.matchId = page.matchId;
  }
  return Object.keys(ctx).length ? ctx : undefined;
}

/** The context of a Why?: always the open deck, even after the chip's × was pressed, since the hint means nothing without it. */
export function askContext(page: LogPosePage | null, extra: LogPoseAsk["context"] | null | undefined): ChatContext | undefined {
  const ctx = { ...messageContext(page, false), ...extra };
  return Object.keys(ctx).length ? ctx : undefined;
}

/** What the panel does with a request: wait for the last chat to load, fill the composer, or send. */
export function requestAction(req: Pick<LogPoseAsk, "send">, state: { busy: boolean; history: "idle" | "loading" | "done" }): "wait" | "prefill" | "send" {
  if (state.history !== "done") return "wait";
  if (state.busy || req.send === false) return "prefill";
  return "send";
}
