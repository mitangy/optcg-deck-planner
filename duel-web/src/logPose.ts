/** Where duel-web shows the Log Pose chat, and what each page tells it. */
import type { DeckContext, LogPosePage, ParsedSource, SourceHooks } from "@optcg/analyst-client";
import { lookupCard } from "./cards/atlas";

/**
 * Routes that hide the compass and panel: anything that renders a board (online, hotseat,
 * spectating, demo) plus the sign-in hand-off pages.
 */
const NO_LOG_POSE = ["/duel", "/hotseat", "/watch", "/demo", "/auth/complete", "/welcome"];

export function showsLogPose(pathname: string): boolean {
  return !NO_LOG_POSE.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Starter prompts and page id for routes whose page doesn't register its own context. */
export function defaultLogPosePage(pathname: string): LogPosePage {
  if (pathname === "/history" || pathname === "/history/") {
    return { page: "history", starters: ["What am I losing to?"] };
  }
  const page = pathname === "/" ? "lobby" : pathname.replace(/^\/+/, "").split("/")[0] || "lobby";
  return { page, starters: ["What's winning lately?", "Which leader suits me?"] };
}

export const DECK_EDITOR_STARTERS = ["Review this deck", "How does it do against the top decks?", "What would you cut?"];
export const MATCH_LOG_STARTERS = ["What decided this game?", "What should I have done differently?"];

/** A saved deck (main deck as one id per copy) as the chat's deck context: one entry per card with its copies. */
export function deckContext(deck: { name: string; leaderId: string; cards: string[] }): DeckContext {
  const copies = new Map<string, number>();
  for (const id of deck.cards) copies.set(id, (copies.get(id) ?? 0) + 1);
  return {
    name: deck.name,
    leaderId: deck.leaderId || null,
    cards: [...copies].map(([id, n]) => ({ id, copies: n })),
  };
}

/** What the match log page does with Log Pose's post-game review. */
export type ReviewMode = "hidden" | "cut-off" | "auto";

/**
 * Hidden while chat is off (or unknown); a game that never finished is never reviewed
 * automatically; otherwise the saved review is shown, or generated when there is none.
 */
export function reviewMode(enabled: boolean | null, finished: boolean | undefined): ReviewMode {
  if (enabled !== true) return "hidden";
  if (finished === false) return "cut-off";
  return "auto";
}

/** Where a cited source opens in the duel app: the log of one of your own games (at the turn cited). Archive games and everything else have no page here. */
export function sourceHref(source: ParsedSource): string | null {
  if (source.kind !== "match" || !source.id) return null;
  return `/history/${encodeURIComponent(source.id)}${source.turn ? `#turn-${source.turn}` : ""}`;
}

/** What the panel shows for cited sources: links to your match logs and card names and pictures from the atlas. */
export const SOURCE_HOOKS: SourceHooks = {
  href: sourceHref,
  card: (id) => {
    const card = lookupCard(id);
    return { name: card.name, imageUrl: card.imageUrl };
  },
};
