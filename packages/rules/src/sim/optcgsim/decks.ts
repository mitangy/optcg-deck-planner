/**
 * Decks seen in OPTCGSim games, as `{ leaderId, deck }` lists for the bots' deck prior (#1030). Pure.
 * Only the OPPONENT's list is taken: the recording player's own decks are one person's pool, the opponents are
 * whoever they met. Lists that are not exactly 50 cards of known, non-Leader cards are dropped.
 */
import { getCardDef, hasCardDef } from "../../cards/definitions.js";
import type { SimGame } from "./types.js";

export function opponentDecksFromSimGames(games: readonly SimGame[]): { leaderId: string; deck: string[] }[] {
  const out: { leaderId: string; deck: string[] }[] = [];
  for (const g of games) {
    const leaderId = g.opp.leaderId;
    if (!leaderId || !hasCardDef(leaderId) || getCardDef(leaderId).type !== "leader") continue;
    const deck = g.opp.decklist.flatMap((c) => new Array<string>(c.count).fill(c.id));
    if (deck.length !== 50 || !deck.every((id) => hasCardDef(id) && getCardDef(id).type !== "leader")) continue;
    out.push({ leaderId, deck });
  }
  return out;
}
