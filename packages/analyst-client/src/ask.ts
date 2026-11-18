import { HINT_CARD_ID_MAX, HINT_LIMITS, type HintContext } from "@optcg/analyst-contract";
import type { ChatContext, DeckContext, GameChatContext } from "./client";
import type { LogPosePage } from "./LogPose";

export { HINT_LIMITS, type HintContext };

export type LogPoseAsk = {
  prompt: string;
  context?: { hint?: HintContext; deck?: DeckContext };
  send?: boolean;
};

export function hintAsk(h: HintContext): LogPoseAsk {
  const title = h.title.slice(0, HINT_LIMITS.title);
  const hint: HintContext = {
    id: h.id.slice(0, HINT_LIMITS.id),
    tier: h.tier,
    title,
    detail: h.detail.slice(0, HINT_LIMITS.detail),
  };
  if (h.cardIds?.length) hint.cardIds = h.cardIds.slice(0, HINT_LIMITS.cards).map((c) => c.slice(0, HINT_CARD_ID_MAX));
  return { prompt: `Why does my deck show the “${title}” hint, and what would you change?`, context: { hint } };
}

export function canAsk(enabled: boolean | null, hidden: boolean): boolean {
  return enabled === true && !hidden;
}

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

// Always the open deck, even after the chip's × was pressed: the hint means nothing without it.
export function askContext(page: LogPosePage | null, extra: LogPoseAsk["context"] | null | undefined): ChatContext | undefined {
  const ctx = { ...messageContext(page, false), ...extra };
  return Object.keys(ctx).length ? ctx : undefined;
}

export function requestAction(req: Pick<LogPoseAsk, "send">, state: { busy: boolean; history: "idle" | "loading" | "done" }): "wait" | "prefill" | "send" {
  if (state.history !== "done") return "wait";
  if (state.busy || req.send === false) return "prefill";
  return "send";
}

export function gameMessageContext(
  page: LogPosePage | null,
  game: { context: () => GameChatContext | null } | null,
  dropped: boolean,
): ChatContext | undefined {
  const base = messageContext(page, dropped);
  if (!game || dropped) return base;
  const snapshot = game.context();
  return snapshot ? { ...base, page: "duel-board", game: snapshot } : base;
}
