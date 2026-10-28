/**
 * Log Pose builds a new deck (#726): the chat-only propose_new_deck tool checks a full 50-card list and its legality and
 * writes nothing. The app opens its create-deck page with the list filled in, and the player presses Create to save it.
 */
import { normalizeStatsCardId } from "@optcg/deck-analytics";
import { z } from "zod";
import type { Catalog } from "./catalog";
import { deckFromLines } from "./decks";
import type { OfficialLibrary } from "./official/library";
import { problemsOf } from "./proposals";
import type { ToolDef } from "./server";

export const NEW_DECK_TOOL = "propose_new_deck";
export const NEW_DECK_TOO_MANY_ERROR = "One new deck per answer, please.";
const MAX_DRAFTS_PER_TURN = 2;
const DECK_SIZE = 50;

export type NewDeckInput = { name: string; leader_id: string; cards: { id: string; copies: number }[]; summary: string };

export type NewDeckDraft = {
  id: string;
  version: 1;
  name: string;
  leader_id: string;
  leader_name: string;
  summary: string;
  cards: { id: string; name: string; copies: number }[];
  count: number;
  legality: { legal: boolean; problems: string[]; upcoming: string[]; ban_list_checked: boolean };
};

export type NewDeckResult = { ok: true; draft: Omit<NewDeckDraft, "id"> } | { ok: false; error: string };

/** Checks a whole new deck: a real leader, real main deck cards listed once, exactly 50 cards, and no rule or ban problem. */
export async function proposeNewDeck(catalog: Catalog, library: OfficialLibrary | undefined, input: NewDeckInput): Promise<NewDeckResult> {
  const leaderId = normalizeStatsCardId(input.leader_id);
  const leader = catalog.cards.get(leaderId);
  if (leader?.type !== "leader") return { ok: false, error: `${leaderId} is not a leader card. Look the leader up with search_cards.` };

  const seen = new Set<string>();
  const cards: NewDeckDraft["cards"] = [];
  for (const c of input.cards) {
    const id = normalizeStatsCardId(c.id);
    const card = catalog.cards.get(id);
    if (/^DON/i.test(id)) return { ok: false, error: `${id} is a DON!! card; leave DON!! out of the list.` };
    if (!card) return { ok: false, error: `${id} is not a card number in the catalog. Look it up with search_cards.` };
    if (card.type === "leader") return { ok: false, error: `${id} is a leader. Put it in leader_id, not in cards.` };
    if (seen.has(id)) return { ok: false, error: `${id} is listed twice. Combine it into one entry.` };
    seen.add(id);
    cards.push({ id, name: card.name, copies: c.copies });
  }

  const deck = deckFromLines(catalog, cards, leaderId);
  const checked = await problemsOf(catalog, library, deck);
  const problems = checked.problems.map((p) => p.text);
  if (problems.length) {
    return {
      ok: false,
      error: `This deck is not legal: ${[...new Set(problems)].join("; ")}. Fix the list and call propose_new_deck again, or explain why it can't be done.`,
    };
  }
  return {
    ok: true,
    draft: {
      version: 1,
      name: input.name.trim(),
      leader_id: leaderId,
      leader_name: leader.name,
      summary: input.summary,
      cards,
      count: checked.count,
      legality: { legal: true, problems: [], upcoming: checked.upcoming.slice(0, 20), ban_list_checked: checked.banChecked },
    },
  };
}

const textOf = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });
const refusal = (error: string) => ({ isError: true, content: [{ type: "text" as const, text: error }] });

/** The chat's propose_new_deck tool. Made fresh for every turn. */
export function newDeckTool(catalog: Catalog, knowledge: { library?: OfficialLibrary }): ToolDef {
  let made = 0;
  return {
    name: NEW_DECK_TOOL,
    title: "Build new deck",
    description:
      "Build a new deck for the player when they ask you to build, make or create one. Give the leader and the full main deck (every card by number with 1-4 copies, or more for a card that allows any number, 50 cards in all, leader and DON!! not counted). " +
      "Nothing is saved: the app opens its create-deck page with this name and list filled in and the player presses Create. " +
      "The list is checked for 50 cards, at most 4 copies, the leader's colors and rules, and the ban list; a list that breaks one is refused with the reasons.",
    inputSchema: {
      name: z.string().trim().min(2).max(60),
      leader_id: z.string().max(20),
      cards: z
        .array(z.object({ id: z.string().max(20), copies: z.number().int().min(1).max(DECK_SIZE) }))
        .min(1)
        .max(DECK_SIZE),
      summary: z.string().trim().min(3).max(300),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (args) => {
      if (made >= MAX_DRAFTS_PER_TURN) return refusal(NEW_DECK_TOO_MANY_ERROR);
      const result = await proposeNewDeck(catalog, knowledge.library, args as NewDeckInput);
      if (!result.ok) return refusal(result.error);
      made++;
      return textOf(result.draft);
    },
  };
}
