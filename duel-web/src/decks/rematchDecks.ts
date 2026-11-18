import { lookupCard } from "../cards/atlas";
import type { PlayerDeckWire } from "../net/protocol";
import { deckToWire, listSavedDecks } from "./storage";

export type RematchDeckOption = {
  id: string;
  name: string;
  leaderId: string;
  leaderName: string;
  cards: number;
  wire: PlayerDeckWire;
};

export function rematchDeckOptions(): RematchDeckOption[] {
  return listSavedDecks().map((d) => ({
    id: d.id,
    name: d.name,
    leaderId: d.leaderId,
    leaderName: lookupCard(d.leaderId).name,
    cards: d.cards.length,
    wire: deckToWire(d),
  }));
}
