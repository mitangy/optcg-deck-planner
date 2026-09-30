import { buildOptcgSimExport, type OptcgSimExportCard } from "./optcgsimExport";

const DUEL_URL = (
  (import.meta.env.VITE_DUEL_URL as string | undefined)?.trim() || "https://optcgduel.app"
).replace(/\/+$/, "");

/** Link that opens the deck in the duel app (`?planner` for signed-in users, `#list` for guests). */
export function duelPlayUrl(deck: {
  id: number | string;
  name: string;
  leader_card_id?: string | null;
  cards: OptcgSimExportCard[];
}): string | null {
  if (!deck.leader_card_id) return null;
  const { pasteText, lineCount } = buildOptcgSimExport(deck.cards, {
    leaderCardId: deck.leader_card_id,
  });
  if (lineCount === 0) return null;
  return (
    `${DUEL_URL}/decks?planner=${encodeURIComponent(String(deck.id))}` +
    `#list=${encodeURIComponent(pasteText)}&name=${encodeURIComponent(deck.name)}`
  );
}
