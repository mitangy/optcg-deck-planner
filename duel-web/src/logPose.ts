import { createStore } from "./lib/createStore";
import type { DeckContext, LogPosePage, ParsedSource, SourceHooks } from "@optcg/analyst-client";
import { lookupCard } from "./cards/atlas";

const NO_LOG_POSE = ["/duel", "/hotseat", "/watch", "/demo", "/replay", "/auth/complete", "/welcome"];

export function showsLogPose(pathname: string): boolean {
  return !NO_LOG_POSE.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function logPoseChromeFor(pathname: string, boardBrief: boolean): { hidden: boolean; launcher: boolean } {
  return { hidden: !showsLogPose(pathname) && !boardBrief, launcher: showsLogPose(pathname) };
}

const boardReasons = new Set<"brief" | "copilot">();
const boardOpens = createStore(false);

function setBoardReason(reason: "brief" | "copilot", on: boolean): void {
  if (boardReasons.has(reason) === on) return;
  if (on) boardReasons.add(reason);
  else boardReasons.delete(reason);
  boardOpens.set(boardReasons.size > 0);
}

export function setBoardBrief(on: boolean): void {
  setBoardReason("brief", on);
}

export function setBoardCopilot(on: boolean): void {
  setBoardReason("copilot", on);
}

export function boardOpensLogPose(): boolean {
  return boardReasons.size > 0;
}

export function useBoardBrief(): boolean {
  return boardOpens.use();
}

export function defaultLogPosePage(pathname: string): LogPosePage {
  if (pathname === "/history" || pathname === "/history/") {
    return { page: "history", starters: ["What am I losing to?"] };
  }
  const page = pathname === "/" ? "lobby" : pathname.replace(/^\/+/, "").split("/")[0] || "lobby";
  return { page, starters: ["What's winning lately?", "Which leader suits me?"] };
}

export const DECK_EDITOR_STARTERS = ["Review this deck", "How does it do against the top decks?", "What would you cut?"];
export const MATCH_LOG_STARTERS = ["What decided this game?", "What should I have done differently?"];

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

export type ReviewMode = "hidden" | "cut-off" | "auto";

export function reviewMode(enabled: boolean | null, finished: boolean | undefined): ReviewMode {
  if (enabled !== true) return "hidden";
  if (finished === false) return "cut-off";
  return "auto";
}

export function sourceHref(source: ParsedSource): string | null {
  if (source.kind !== "match" || !source.id) return null;
  return `/history/${encodeURIComponent(source.id)}${source.turn ? `#turn-${source.turn}` : ""}`;
}

export function deckHref(ref: string): string | null {
  return ref.startsWith("duel:") ? `/decks/${encodeURIComponent(ref.slice(5))}/configure` : null;
}

export function openDeckFor(navigate: (to: string) => void): NonNullable<SourceHooks["openDeck"]> {
  return (ref) => {
    const to = deckHref(ref);
    if (!to) return false;
    navigate(to);
    return true;
  };
}

export const SOURCE_HOOKS: SourceHooks = {
  href: sourceHref,
  deckHref,
  card: (id) => {
    const card = lookupCard(id);
    return { name: card.name, imageUrl: card.imageUrl };
  },
};

export const DRAFT_STATE_KEY = "logPoseDraft";

export function readLogPoseDraft(state: unknown): { name: string; list: string } | null {
  const d = state && typeof state === "object" ? (state as Record<string, unknown>)[DRAFT_STATE_KEY] : null;
  if (!d || typeof d !== "object") return null;
  const { name, list } = d as Record<string, unknown>;
  return typeof name === "string" && typeof list === "string" && list.trim() ? { name, list } : null;
}

export function inGameRoute(pathname: string): boolean {
  return ["/duel", "/hotseat", "/watch", "/replay", "/demo"].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

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
