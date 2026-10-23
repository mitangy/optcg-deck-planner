/**
 * A position in words for the model (#677): both boards, the acting player's hand and a card reference block.
 * Printed power is in the card reference; the power a card has right now is never written here, because that is
 * what the questions ask for.
 */
import type { CardInstance, MatchState, Seat } from "@optcg/rules";
import type { Catalog } from "../../src/catalog";
import { cardReferenceLine } from "../../src/copilot";
import { MESSAGE_LIMIT, NEW_SET } from "./types";

export const nameOf = (catalog: Catalog, defId: string): string => catalog.cards.get(defId)?.name ?? defId;
export const labelOf = (catalog: Catalog, defId: string): string => `${nameOf(catalog, defId)} (${defId})`;

/** "Name (ID) x2, Other (ID)" for a list of card ids, in first-seen order. */
export function countedList(catalog: Catalog, ids: readonly string[]): string {
  const n = new Map<string, number>();
  for (const id of ids) n.set(id, (n.get(id) ?? 0) + 1);
  return [...n].map(([id, k]) => `${labelOf(catalog, id)}${k > 1 ? ` x${k}` : ""}`).join(", ");
}

export type Described = { text: string; cardIds: string[] };

/** The cards a board shows: Leader, Characters, Stage. */
export const boardCards = (state: MatchState, seat: Seat): CardInstance[] => {
  const p = state.players[seat];
  return [p.leader, ...p.characters, ...(p.stage ? [p.stage] : [])];
};

function piece(state: MatchState, seat: Seat, catalog: Catalog, c: CardInstance, opts: { attacking?: boolean } = {}): string {
  const bits = [
    c.rested ? "rested" : "active",
    c.attachedDonIds.length ? `${c.attachedDonIds.length} DON!! attached` : "",
    // A Character that entered this turn is "summoning sick" only during its owner's own turn.
    c.summoningSick && state.activeSeat === seat ? "played this turn" : "",
    opts.attacking ? "attacking" : "",
  ].filter(Boolean);
  return `${labelOf(catalog, c.defId)}, ${bits.join(", ")}`;
}

/** One seat's public side of the table. `own` also lists the hand; the other side's hand is only a count. */
export function describeSeat(state: MatchState, seat: Seat, catalog: Catalog, label: "Your" | "Opponent's", opts: { attackerId?: string } = {}): string[] {
  const p = state.players[seat];
  const rested = p.costArea.filter((d) => d.rested).length;
  const own = label === "Your";
  const mark = (c: CardInstance) => piece(state, seat, catalog, c, { attacking: c.id === opts.attackerId });
  return [
    `${label} Leader: ${mark(p.leader)}`,
    `${label} Characters: ${p.characters.length ? p.characters.map((c) => `[${mark(c)}]`).join(" ") : "none"}`,
    `${label} Stage: ${p.stage ? mark(p.stage) : "none"}`,
    `${label} Life: ${p.life.length}. Deck: ${p.deck.length}. DON!!: ${p.costArea.length - rested} active, ${rested} rested in the cost area, ${p.attachedDons.length} attached, ${p.donDeck.length} in the DON!! deck.`,
    `${label} trash (${p.trash.length}): ${p.trash.length ? countedList(catalog, p.trash) : "empty"}`,
    own ? `Your hand (${p.hand.length}): ${p.hand.length ? p.hand.map((c) => labelOf(catalog, c.defId)).join("; ") : "empty"}` : `Opponent's hand: ${p.hand.length} cards (hidden).`,
  ];
}

/** Every card id the position shows, own side first: Leaders, Characters, Stages, then the viewer's hand. */
export function shownCardIds(state: MatchState, view: Seat, extra: readonly string[] = []): string[] {
  const ids = [...boardCards(state, view), ...boardCards(state, (1 - view) as Seat), ...state.players[view].hand].map((c) => c.defId);
  return [...new Set([...ids, ...extra])];
}

export const referenceLines = (catalog: Catalog, ids: readonly string[], cap: number): string[] =>
  ids.flatMap((id) => {
    const row = catalog.cards.get(id);
    if (!row) return [];
    return [cardReferenceLine(row.text.length > cap ? { ...row, text: `${row.text.slice(0, cap - 1)}…` } : row)];
  });

/** Each card the position shows must be one the engine implements in full, or the engine's answer would not follow the printed text. */
export const fullySupported = (catalog: Catalog, ids: readonly string[]): boolean => ids.every((id) => ["supported", "vanilla"].includes(catalog.cards.get(id)?.support ?? "unknown"));

export const hasNewSet = (ids: readonly string[]): boolean => ids.some((id) => NEW_SET.test(id));

export const ANSWER_FORMAT = (schema: string) =>
  `Work it out from the One Piece Card Game rules and the cards above, then end your reply with the answer as a fenced JSON block in exactly this form:\n\`\`\`json\n${schema}\n\`\`\``;

export type Assembled = { position: string; message: string };

/**
 * The position block and the player's message. Card text is cut shorter (400, 300, 200 characters) until the whole message
 * fits the production chat limit; undefined when even that is too long.
 */
export function assemble(catalog: Catalog, headLines: readonly string[], cardIds: readonly string[], question: string, schema: string): Assembled | undefined {
  for (const cap of [400, 300, 200]) {
    const position = [...headLines, "", "Card reference:", ...referenceLines(catalog, cardIds, cap)].join("\n");
    const message = `${position}\n\nQuestion: ${question}\n\n${ANSWER_FORMAT(schema)}`;
    if (message.length <= MESSAGE_LIMIT) return { position, message };
  }
  return undefined;
}
