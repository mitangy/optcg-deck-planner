/**
 * Log Pose's deck edit suggestions (#400): the chat-only propose_deck_edit tool checks a change to the deck the
 * player has open and its legality, and writes nothing. The app shows the result as an Apply card.
 */
import { normalizeStatsCardId } from "@optcg/deck-analytics";
import { z } from "zod";
import { analyzeDeck } from "./analysis";
import type { Catalog } from "./catalog";
import { deckFromLines, type Deck } from "./decks";
import { deckBanCheck } from "./knowledge";
import type { OfficialLibrary } from "./official/library";
import type { ToolDef } from "./server";

export const PROPOSE_TOOL = "propose_deck_edit";

/** The deck the app says is open: the chat request's `context.deck`. */
export type ContextDeck = {
  name?: string;
  leaderId?: string | null;
  cards?: { id: string; copies: number }[];
  ref?: string;
};

export type DeckEditProposal = {
  id: string;
  version: 1;
  target: { ref: string; name: string; leader_id: string | null };
  summary: string;
  lines: { id: string; name: string; before: number; after: number; reason: string }[];
  /** The deck as sent in the context block, with normalized ids. */
  base: { id: string; copies: number }[];
  legality: { legal: boolean; count: number; problems: string[]; upcoming: string[]; ban_list_checked: boolean };
};

export type ProposalInput = { summary: string; changes: { id: string; delta: number; reason: string }[] };

export type ProposalResult = { ok: true; proposal: Omit<DeckEditProposal, "id"> } | { ok: false; error: string };

export const NO_DECK_ERROR =
  "No deck is open in the app (or the player hid it), so there is nothing to apply this to. Write the changes as +N / -N lines instead.";
export const TOO_MANY_ERROR = "One suggestion per answer, please.";
const MAX_PROPOSALS_PER_TURN = 4;
const DECK_SIZE = 50;

type Problem = { key: string; text: string };

/** The deck's rule problems (count, copies, colors, leader rules) and, with a ban list, its ban problems. */
async function problemsOf(catalog: Catalog, library: OfficialLibrary | undefined, deck: Deck) {
  const rule: Problem[] = analyzeDeck(catalog, deck)
    .hints.filter((h) => h.tier === "rule")
    // One key per offending card, so fixing only some of them adds nothing; a hint with no cards keeps one key.
    .flatMap((h) => (h.cardIds?.length ? h.cardIds : [""]).map((cardId) => ({ key: `${h.id}:${cardId}`, text: h.title })));
  const ban = library ? await deckBanCheck(library, deck) : null;
  const banProblems: Problem[] = (ban?.problems ?? []).map((p) => ({ key: p.problem, text: p.problem }));
  const upcoming = (ban?.upcoming ?? []).map((p) => `${p.problem} (from ${p.effective})`);
  const count = deck.cards.reduce((s, c) => s + c.copies, 0);
  return { problems: [...rule, ...banProblems], upcoming, count, banChecked: ban?.checked ?? false };
}

/**
 * Problems the change adds: a key the deck did not have before, or a card count further from 50 than before.
 * A deck that was already illegal can still get an unrelated fix.
 */
function introducedProblems(before: Problem[], beforeCount: number, after: Problem[], afterCount: number): string[] {
  const had = new Set(before.map((p) => p.key));
  const added = [...new Set(after.filter((p) => !had.has(p.key)).map((p) => p.text))];
  if (Math.abs(afterCount - DECK_SIZE) > Math.abs(beforeCount - DECK_SIZE)) added.push(`${afterCount} of ${DECK_SIZE} cards`);
  return added;
}

export async function proposeDeckEdit(
  catalog: Catalog,
  library: OfficialLibrary | undefined,
  deck: ContextDeck | undefined,
  input: ProposalInput,
): Promise<ProposalResult> {
  if (!deck?.ref || !deck.leaderId) return { ok: false, error: NO_DECK_ERROR };
  const leaderId = normalizeStatsCardId(deck.leaderId);
  const beforeDeck = deckFromLines(catalog, deck.cards ?? [], leaderId);
  if (beforeDeck.leaderId !== leaderId) return { ok: false, error: NO_DECK_ERROR };
  const owned = new Map(beforeDeck.cards.map((c) => [c.id, c.copies]));

  const seen = new Set<string>();
  const lines: DeckEditProposal["lines"] = [];
  for (const c of input.changes) {
    const id = normalizeStatsCardId(c.id);
    const card = catalog.cards.get(id);
    if (/^DON/i.test(id)) return { ok: false, error: `${id} is a DON!! card; DON!! changes aren't supported.` };
    if (!card) return { ok: false, error: `${id} is not a card number in the catalog. Look it up with search_cards.` };
    if (card.type === "leader") return { ok: false, error: `${id} is a leader. Changing the leader isn't supported; only main deck cards.` };
    if (seen.has(id)) return { ok: false, error: `${id} is listed twice. Combine it into one change.` };
    seen.add(id);
    if (c.delta === 0) return { ok: false, error: `${id} has a change of 0. Leave it out.` };
    const before = owned.get(id) ?? 0;
    const after = before + c.delta;
    if (after < 0) return { ok: false, error: `The deck has only ${before} ${before === 1 ? "copy" : "copies"} of ${id} (${card.name}); can't remove ${-c.delta}.` };
    if (after > DECK_SIZE) return { ok: false, error: `${id} would have ${after} copies; a deck holds ${DECK_SIZE} cards.` };
    lines.push({ id, name: card.name, before, after, reason: c.reason });
  }

  const next = new Map(owned);
  for (const l of lines) next.set(l.id, l.after);
  const afterDeck = deckFromLines(catalog, [...next].map(([id, copies]) => ({ id, copies })), leaderId);

  const was = await problemsOf(catalog, library, beforeDeck);
  const now = await problemsOf(catalog, library, afterDeck);
  const added = introducedProblems(was.problems, was.count, now.problems, now.count);
  if (added.length) {
    return {
      ok: false,
      error: `This change would add a problem to the deck: ${added.join("; ")}. Adjust the changes and call propose_deck_edit again, or explain why it can't be done.`,
    };
  }

  const ordered = [...lines.filter((l) => l.after > l.before), ...lines.filter((l) => l.after < l.before)];
  return {
    ok: true,
    proposal: {
      version: 1,
      target: { ref: deck.ref, name: deck.name?.trim() || "Deck", leader_id: leaderId },
      summary: input.summary,
      lines: ordered,
      base: beforeDeck.cards.map((c) => ({ id: c.id, copies: c.copies })),
      legality: {
        legal: now.problems.length === 0,
        count: now.count,
        problems: now.problems.map((p) => p.text).slice(0, 20),
        upcoming: now.upcoming.slice(0, 20),
        ban_list_checked: now.banChecked,
      },
    },
  };
}

const textOf = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });
const refusal = (error: string) => ({ isError: true, content: [{ type: "text" as const, text: error }] });

/** The chat's propose_deck_edit tool, bound to the deck the player has open. Made fresh for every turn. */
export function deckEditTool(catalog: Catalog, knowledge: { library?: OfficialLibrary }, deck: ContextDeck | undefined): ToolDef {
  let made = 0;
  return {
    name: PROPOSE_TOOL,
    title: "Suggest deck edit",
    description:
      "Suggest changes to the deck open in the app (the deck in the <context> block). Nothing is changed: the app shows them as a card with Apply and Dismiss. " +
      "Give every change at once; delta adds (positive) or removes (negative) copies. The resulting deck is checked for 50 cards, at most 4 copies, the leader's colors and rules, and the ban list. " +
      "A change that adds a problem is refused with the reason.",
    inputSchema: {
      summary: z.string().trim().min(3).max(300),
      changes: z
        .array(
          z.object({
            id: z.string().max(20),
            delta: z.number().int().min(-4).max(4),
            reason: z.string().trim().min(3).max(200),
          }),
        )
        .min(1)
        .max(12),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (args) => {
      if (made >= MAX_PROPOSALS_PER_TURN) return refusal(TOO_MANY_ERROR);
      const result = await proposeDeckEdit(catalog, knowledge.library, deck, args as ProposalInput);
      if (!result.ok) return refusal(result.error);
      made++;
      return textOf(result.proposal);
    },
  };
}
