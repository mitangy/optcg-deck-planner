/** Where the planner shows the Log Pose chat, and what the deck page tells it. */
import type { DeckContext, DeckEditOp, LogPosePage, SourceHooks } from "@optcg/analyst-client";

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
  id?: number;
  name: string;
  leader_card_id: string | null;
  cards: { card_id: string; needed: number; section: string }[];
};

/** A planner deck as the chat's deck context: its cards with their copies (main and a variant's additional ones, no leader, no DON!!). */
export function plannerDeckContext(deck: DeckCards): DeckContext {
  const leader = (deck.leader_card_id ?? "").trim().toUpperCase();
  const copies = new Map<string, number>();
  for (const c of deck.cards) {
    if ((c.section || "main").toLowerCase() === "don" || c.needed <= 0) continue;
    if (c.card_id.trim().toUpperCase() === leader) continue;
    copies.set(c.card_id, (copies.get(c.card_id) ?? 0) + c.needed);
  }
  return {
    name: deck.name,
    ...(deck.id ? { ref: `planner:${deck.id}` } : {}),
    leaderId: deck.leader_card_id || null,
    cards: [...copies].map(([id, n]) => ({ id, copies: n })),
    ...(deck.id ? { plannerDeckId: deck.id } : {}),
  };
}

/** Where an edit for a planner deck can be applied: its deck page. */
export const PLANNER_SOURCE_HOOKS: SourceHooks = {
  deckHref: (ref) => (ref.startsWith("planner:") ? `/decks/${ref.slice(8)}` : null),
};

/**
 * Applies Log Pose's suggested changes to a planner deck with its existing absolute-count save, one card at a
 * time, decreases first so the deck never grows past the limit on the way. When a save fails, the lines already
 * saved are set back (best effort) and the error says whether anything was left changed. Returns what the last
 * save returned (the deck detail, for the page to show).
 */
export async function applyPlannerEdit<T>(save: (cardId: string, needed: number) => Promise<T>, ops: DeckEditOp[]): Promise<T | undefined> {
  const ordered = [...ops].sort((a, b) => a.after - a.before - (b.after - b.before));
  const done: DeckEditOp[] = [];
  let last: T | undefined;
  for (const op of ordered) {
    try {
      last = await save(op.id, op.after);
      done.push(op);
    } catch (e) {
      let restored = true;
      for (const d of done.reverse()) {
        try {
          await save(d.id, d.before);
        } catch {
          restored = false;
        }
      }
      const why = e instanceof Error && e.message ? e.message : "request failed";
      throw new Error(`Couldn't save ${op.id}: ${why}. ${restored ? "Nothing was changed." : "Some changes were saved; check the deck."}`);
    }
  }
  return last;
}
