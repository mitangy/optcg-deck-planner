/** Where the planner shows the Log Pose chat, and what the deck page tells it. */
import type { DeckContext, LogPosePage } from "@optcg/analyst-client";

/** Public share links are for people without an account; the sign-in page has no session yet. */
const NO_LOG_POSE = ["/share", "/login"];

export function showsLogPose(pathname: string): boolean {
  return !NO_LOG_POSE.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export const DECK_STARTERS = ["Review this deck", "Make it cheaper with what I own", "How does it do against the top decks?"];

export function defaultLogPosePage(pathname: string): LogPosePage {
  const page = pathname.replace(/^\/+/, "").split("/")[0] || "shopping";
  return { page, starters: ["What's winning lately?", "What should I build next?"] };
}

type DeckCards = {
  name: string;
  leader_card_id: string | null;
  cards: { card_id: string; needed: number; section: string }[];
};

/** A planner deck as the chat's deck context: main-deck cards with their copies (no leader, no DON!!). */
export function plannerDeckContext(deck: DeckCards): DeckContext {
  const leader = (deck.leader_card_id ?? "").trim().toUpperCase();
  const copies = new Map<string, number>();
  for (const c of deck.cards) {
    if ((c.section || "main").toLowerCase() !== "main" || c.needed <= 0) continue;
    if (c.card_id.trim().toUpperCase() === leader) continue;
    copies.set(c.card_id, (copies.get(c.card_id) ?? 0) + c.needed);
  }
  return {
    name: deck.name,
    leaderId: deck.leader_card_id || null,
    cards: [...copies].map(([id, n]) => ({ id, copies: n })),
  };
}
