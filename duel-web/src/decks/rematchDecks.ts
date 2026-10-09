import { lookupCard } from "../cards/atlas";
import type { PlayerDeckWire } from "../net/protocol";
import { deckToWire, listSavedDecks } from "./storage";

/** A saved deck offered on the rematch panel. */
export type RematchDeckOption = {
  id: string;
  name: string;
  leaderName: string;
  cards: number;
  wire: PlayerDeckWire;
};

/** Saved decks a player can switch to when asking for / accepting a rematch. */
export function rematchDeckOptions(): RematchDeckOption[] {
  return listSavedDecks().map((d) => ({
    id: d.id,
    name: d.name,
    leaderName: lookupCard(d.leaderId).name,
    cards: d.cards.length,
    wire: deckToWire(d),
  }));
}
