/** Where the planner shows the Log Pose chat, and what the deck page tells it. */
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
export const plannerDeckHref = (ref: string): string | null => (ref.startsWith("planner:") ? `/decks/${ref.slice(8)}` : null);

export const PLANNER_SOURCE_HOOKS: SourceHooks = {
  deckHref: plannerDeckHref,
};

/** Opens a planner deck's page inside the app (no page reload), so Log Pose's answer stays on screen; false for a deck that isn't a planner one. */
export function openDeckFor(navigate: (to: string) => void): NonNullable<SourceHooks["openDeck"]> {
  return (ref) => {
    const to = plannerDeckHref(ref);
    if (!to) return false;
    navigate(to);
    return true;
  };
}

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

/** The router state key a deck built by Log Pose travels in to the import page (#726). */
export const DRAFT_STATE_KEY = "logPoseDraft";

/** The name and list Log Pose filled in, from a location's state; null when the state is not one. */
export function readLogPoseDraft(state: unknown): { name: string; list: string } | null {
  const d = state && typeof state === "object" ? (state as Record<string, unknown>)[DRAFT_STATE_KEY] : null;
  if (!d || typeof d !== "object") return null;
  const { name, list } = d as Record<string, unknown>;
  return typeof name === "string" && typeof list === "string" && list.trim() ? { name, list } : null;
}

/** Opens the import page (the planner's create-deck page) with Log Pose's deck filled in. The planner has no live board, so it always goes. */
export function openNewDeckFor(navigate: (to: string, options: { state: unknown }) => void): NonNullable<SourceHooks["openNewDeck"]> {
  return (draft) => {
    navigate("/import", { state: { [DRAFT_STATE_KEY]: draft } });
    return true;
  };
}

/**
 * For the import page: fills the name and list from a deck Log Pose handed over in the router state (on arrival, or while the page is
 * already open), then forgets the state so a refresh does not refill it. Returns whether Log Pose filled the form in.
 */
export function useLogPoseDraft(fill: (draft: { name: string; list: string }) => void): boolean {
  const location = useLocation();
  const navigate = useNavigate();
  const [filled, setFilled] = useState(false);
  const fillRef = useRef(fill);
  fillRef.current = fill;
  useEffect(() => {
    const draft = readLogPoseDraft(location.state);
    if (!draft) return;
    fillRef.current(draft);
    setFilled(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);
  return filled;
}
