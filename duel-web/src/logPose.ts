/** Where duel-web shows the Log Pose chat, and what each page tells it. */
import { useSyncExternalStore } from "react";
import type { DeckContext, LogPosePage, ParsedSource, SourceHooks } from "@optcg/analyst-client";
import { lookupCard } from "./cards/atlas";

/**
 * Routes that hide the compass and panel: anything that renders a board (online, hotseat,
 * spectating, demo) plus the sign-in hand-off pages.
 */
const NO_LOG_POSE = ["/duel", "/hotseat", "/watch", "/demo", "/replay", "/auth/complete", "/welcome"];

export function showsLogPose(pathname: string): boolean {
  return !NO_LOG_POSE.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * What the app tells the Log Pose provider for a route. A board hides it entirely, except while that board
 * shows a matchup brief or the copilot (so "Ask Log Pose" can open the panel); the compass is never drawn on a board.
 */
export function logPoseChromeFor(pathname: string, boardBrief: boolean): { hidden: boolean; launcher: boolean } {
  return { hidden: !showsLogPose(pathname) && !boardBrief, launcher: showsLogPose(pathname) };
}

/** Why the board on screen lets Log Pose's panel open over it: a matchup brief, the copilot, or both. */
const boardReasons = new Set<"brief" | "copilot">();
const boardBriefListeners = new Set<() => void>();

function setBoardReason(reason: "brief" | "copilot", on: boolean): void {
  if (boardReasons.has(reason) === on) return;
  if (on) boardReasons.add(reason);
  else boardReasons.delete(reason);
  for (const l of boardBriefListeners) l();
}

/** A board with a matchup brief mounted says so here, so the app can let Log Pose's panel open over it. */
export function setBoardBrief(on: boolean): void {
  setBoardReason("brief", on);
}

/** A board with the Log Pose copilot on says so here, for the same reason. The brief and the copilot don't cancel each other. */
export function setBoardCopilot(on: boolean): void {
  setBoardReason("copilot", on);
}

/** Whether the board on screen lets Log Pose's panel open over it. */
export function boardOpensLogPose(): boolean {
  return boardReasons.size > 0;
}

export function useBoardBrief(): boolean {
  return useSyncExternalStore(
    (l) => {
      boardBriefListeners.add(l);
      return () => boardBriefListeners.delete(l);
    },
    boardOpensLogPose,
    () => false,
  );
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

/** A saved deck (main deck as one id per copy) as the chat's deck context: one entry per card with its copies, and, for a saved deck, a ref saying which one. */
export function deckContext(deck: { id?: string; name: string; leaderId: string; cards: string[]; plannerDeckId?: number }): DeckContext {
  const copies = new Map<string, number>();
  for (const id of deck.cards) copies.set(id, (copies.get(id) ?? 0) + 1);
  return {
    name: deck.name,
    ref: deck.id ? `duel:${deck.id}` : undefined,
    leaderId: deck.leaderId || null,
    cards: [...copies].map(([id, n]) => ({ id, copies: n })),
    ...(deck.plannerDeckId ? { plannerDeckId: deck.plannerDeckId } : {}),
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

/** Where an edit for a saved deck can be applied: its deck editor. */
export function deckHref(ref: string): string | null {
  return ref.startsWith("duel:") ? `/decks/${encodeURIComponent(ref.slice(5))}/configure` : null;
}

/** Opens a saved deck's editor inside the app (no page reload), so Log Pose's answer stays on screen; false for a deck that isn't one of ours. */
export function openDeckFor(navigate: (to: string) => void): NonNullable<SourceHooks["openDeck"]> {
  return (ref) => {
    const to = deckHref(ref);
    if (!to) return false;
    navigate(to);
    return true;
  };
}

/** What the panel shows for cited sources: links to your match logs and card names and pictures from the atlas. */
export const SOURCE_HOOKS: SourceHooks = {
  href: sourceHref,
  deckHref,
  card: (id) => {
    const card = lookupCard(id);
    return { name: card.name, imageUrl: card.imageUrl };
  },
};

/** The router state key a deck built by Log Pose travels in to the create-deck page (#726). */
export const DRAFT_STATE_KEY = "logPoseDraft";

/** The name and list Log Pose filled in, from a location's state; null when the state is not one. */
export function readLogPoseDraft(state: unknown): { name: string; list: string } | null {
  const d = state && typeof state === "object" ? (state as Record<string, unknown>)[DRAFT_STATE_KEY] : null;
  if (!d || typeof d !== "object") return null;
  const { name, list } = d as Record<string, unknown>;
  return typeof name === "string" && typeof list === "string" && list.trim() ? { name, list } : null;
}

/** Routes that render a game: a board, a watched game, a replay or the demo. */
export function inGameRoute(pathname: string): boolean {
  return ["/duel", "/hotseat", "/watch", "/replay", "/demo"].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Opens /decks/new with Log Pose's deck filled in. The card opening it by itself (`auto`) never takes the player away from a
 * board, a watched game or a replay: it returns false there. The button the player presses goes too, but from a game route it
 * first asks (`askLeave` gets the move to run on Leave).
 */
export function openNewDeckFor(
  navigate: (to: string, options: { state: unknown }) => void,
  pathname: () => string,
  askLeave: (leave: () => void) => void,
): NonNullable<SourceHooks["openNewDeck"]> {
  return (draft, how) => {
    if (how.auto && !showsLogPose(pathname())) return false;
    const go = () => navigate("/decks/new", { state: { [DRAFT_STATE_KEY]: draft } });
    if (!how.auto && inGameRoute(pathname())) askLeave(go);
    else go();
    return true;
  };
}
