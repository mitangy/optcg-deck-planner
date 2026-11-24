import { normalizeCardId } from "@optcg/card-core";
import { z } from "zod";
import type { Catalog } from "./catalog";
import type { ContextDeck } from "./proposals";
import { legalUnder, openLeaderOf } from "./search";
import type { ToolDef } from "./server";
import { metaFor } from "./toolMeta";
import { refusalResult as refusal, type ToolResult } from "./toolResult";

export const CARD_LIST_TOOL = "show_cards";
export const CARD_LIST_TOO_MANY_ERROR = "That's enough card lists for one answer.";
const MAX_LISTS_PER_TURN = 4;
export const CARD_LIST_MAX = 24;

export type CardListInput = { title: string; cards: { id: string; reason?: string }[] };

export type CardListRow = {
  id: string;
  name: string;
  type: "leader" | "character" | "event" | "stage";
  colors: string[];
  cost?: number;
  power?: number;
  counter?: number;
  reason: string;
  /** The deck may hold any number of copies (omitted otherwise), so the app does not stop at 4. */
  any_number?: true;
};

/** A card list; `dropped` (never sent to the app) names the cards left out because the open deck's leader can't use them. */
export type CardList = { id: string; version: 1; kind: "card_list"; title: string; cards: CardListRow[]; leader_id: string | null };
export type BuiltCardList = Omit<CardList, "id"> & { dropped: string[] };

export type CardListResult = { ok: true; list: BuiltCardList } | { ok: false; error: string };

export function buildCardList(catalog: Catalog, deck: ContextDeck | undefined, input: CardListInput): CardListResult {
  const openLeader = openLeaderOf(catalog, deck?.leaderId);
  const dropped: string[] = [];
  const seen = new Set<string>();
  const cards: CardListRow[] = [];
  for (const c of input.cards) {
    const id = normalizeCardId(c.id);
    if (/^DON/i.test(id)) return { ok: false, error: `${id} is a DON!! card; leave DON!! out of the list.` };
    const card = catalog.cards.get(id);
    if (!card) return { ok: false, error: `${id} is not a card number in the catalog. Look it up with search_cards.` };
    if (seen.has(id)) continue;
    seen.add(id);
    // With a deck open, a card its leader can't use never reaches the player.
    if (openLeader && !legalUnder(catalog, openLeader, card)) {
      dropped.push(`${id} ${card.name}`);
      continue;
    }
    cards.push({
      id,
      name: card.name,
      type: card.type,
      colors: card.colors,
      cost: card.cost,
      power: card.power,
      counter: card.counter,
      reason: c.reason?.trim() ?? "",
      ...(catalog.atlas[id]?.rules?.includes("any_number") ? { any_number: true as const } : {}),
    });
  }
  if (!cards.length) {
    return { ok: false, error: `${openLeader?.name ?? "The open deck's leader"} can't use any of these cards (${dropped.join("; ")}). Search again with search_cards, which only returns cards that leader can use.` };
  }
  return { ok: true, list: { version: 1, kind: "card_list", title: input.title.trim(), cards, leader_id: openLeader?.id ?? null, dropped } };
}

/** What the model reads back: the list is already on the player's screen, so it only needs to say how it matched. */
export function listedFor(built: BuiltCardList): ToolResult {
  const { dropped, ...list } = built;
  const shown = list.cards.map((c) => `${c.id} ${c.name}`).join("; ");
  const text =
    `Shown to the player as a card list "${list.title}" (${shown}), each card with an Add button for their open deck. Nothing was added. ` +
    (dropped.length ? `Left out because the open deck's leader can't use them: ${dropped.join("; ")}. ` : "") +
    "Don't repeat the list in your answer: write 1-3 short sentences on how the cards match what they asked and which ones stand out.";
  return { content: [{ type: "text", text }], value: list };
}

export function cardListTool(catalog: Catalog, deck: ContextDeck | undefined): ToolDef {
  let made = 0;
  return {
    name: CARD_LIST_TOOL,
    ...metaFor(CARD_LIST_TOOL),
    title: "Show cards",
    description:
      "Show the player a list of cards as tappable cards with their art, stats and an Add button for the deck they have open. Use it when they ask you to find, list or suggest cards by a description (colors, trait, effect, cost), after you searched and checked the card text. " +
      "Give the best matches first, with a few words of why each fits. Nothing is added to a deck: the player taps Add on the cards they want. " +
      "With a deck open, cards its leader can't use are left out. Do not write the list out again in your answer.",
    inputSchema: {
      title: z.string().trim().min(2).max(80),
      cards: z
        .array(z.object({ id: z.string().max(20), reason: z.string().trim().max(160).optional() }))
        .min(1)
        .max(CARD_LIST_MAX),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (args) => {
      if (made >= MAX_LISTS_PER_TURN) return refusal(CARD_LIST_TOO_MANY_ERROR);
      const result = buildCardList(catalog, deck, args as CardListInput);
      if (!result.ok) return refusal(result.error);
      made++;
      return listedFor(result.list);
    },
  };
}
