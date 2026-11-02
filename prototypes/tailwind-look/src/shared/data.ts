/** Mock data built from the repo's real card catalog + a real meta deck (see generator in README). */
import raw from "./data.json";

export type Card = {
  id: string; name: string; type: string | null; colors: string[]; cost: number | null;
  power: number | null; counter: number | null; image: string; text: string;
  count?: number; owned?: number; price?: number; rested?: boolean; don?: number;
};
export type Deck = { name: string; leader: Card; size: number; wins: number; losses: number; updated: string; valid: boolean };
export type Side = {
  name: string; leader: Card; chars: Card[]; life: number; deck: number; trash: number;
  don: { active: number; rested: number; deck: number };
};

export const plannerDeck = raw.planner.deck as unknown as {
  name: string; leader: Card; cards: Card[]; event: string; placing: number; players: number;
};
export const collection = raw.planner.collection as unknown as Card[];
export const duelDecks = raw.duel.decks as unknown as Deck[];
export const board = raw.duel.board as unknown as {
  me: Side & { hand: Card[] }; opp: Side & { hand: number }; turn: number; phase: string;
};
export const CARD_BACK = "/card-back.webp";
export const DON_ART = "/DON.jpg";
