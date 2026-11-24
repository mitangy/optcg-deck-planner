import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { tcgArtForCard } from "@optcg/card-core";
import { pageScope, plannerDeckScope, type DeckContext, type DeckEditOp, type LogPosePage, type SourceHooks } from "@optcg/analyst-client";

/** Public share links are for people without an account; the sign-in page has no session yet. */
const NO_LOG_POSE = ["/share", "/login"];

export function showsLogPose(pathname: string): boolean {
  return !NO_LOG_POSE.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export const DECK_STARTERS = ["Review this deck", "Make it cheaper with what I own", "How does it do against the top decks?"];

export function plannerDeckPage(deck: DeckContext): LogPosePage {
  const name = deck.name || "This deck";
  const scope = deck.plannerDeckId ? pageScope(plannerDeckScope(deck.plannerDeckId), name) : undefined;
  return { page: "deck", label: name, deck, ...(scope ? { scope } : {}), starters: DECK_STARTERS };
}

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

export const plannerDeckHref = (ref: string): string | null => (ref.startsWith("planner:") ? `/decks/${ref.slice(8)}` : null);

/** Card art for a card id: the same TCGplayer product image the card data maps it to, so no lookup is needed (#1459). */
export const plannerCardArt: NonNullable<SourceHooks["card"]> = (id) => {
  const imageUrl = tcgArtForCard(id.trim().toUpperCase());
  return imageUrl ? { imageUrl } : null;
};

export const PLANNER_SOURCE_HOOKS: SourceHooks = {
  deckHref: plannerDeckHref,
  card: plannerCardArt,
};

export function openDeckFor(navigate: (to: string) => void): NonNullable<SourceHooks["openDeck"]> {
  return (ref) => {
    const to = plannerDeckHref(ref);
    if (!to) return false;
    navigate(to);
    return true;
  };
}

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

export const DRAFT_STATE_KEY = "logPoseDraft";

export function readLogPoseDraft(state: unknown): { name: string; list: string } | null {
  const d = state && typeof state === "object" ? (state as Record<string, unknown>)[DRAFT_STATE_KEY] : null;
  if (!d || typeof d !== "object") return null;
  const { name, list } = d as Record<string, unknown>;
  return typeof name === "string" && typeof list === "string" && list.trim() ? { name, list } : null;
}

export function openNewDeckFor(navigate: (to: string, options: { state: unknown }) => void): NonNullable<SourceHooks["openNewDeck"]> {
  return (draft) => {
    navigate("/import", { state: { [DRAFT_STATE_KEY]: draft } });
    return true;
  };
}

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
