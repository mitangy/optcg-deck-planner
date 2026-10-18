/** Play vs Bot (#631): the options of a room whose second seat is the server's bot. */
import { deckToWire, type SavedDeck } from "../decks/storage";
import type { DuelCreateOptions } from "../net/protocol";

export type BotLevel = "easy" | "normal";

export const BOT_LEVELS: ReadonlyArray<{ level: BotLevel; label: string; hint: string }> = [
  { level: "easy", label: "Easy", hint: "A relaxed opponent that is easy to beat." },
  { level: "normal", label: "Normal", hint: "A tougher opponent that plays to win." },
];

export const DEFAULT_BOT_LEVEL: BotLevel = "normal";

/** Value of the bot-deck picker meaning "the same deck as yours". */
export const BOT_DECK_MIRROR = "";

/** The deck the bot plays: the picked saved deck, else a mirror of yours (also when the pick was deleted). */
export function resolveBotDeck(decks: SavedDeck[], yours: SavedDeck, pickedId: string): SavedDeck {
  return decks.find((d) => d.id === pickedId) ?? yours;
}

/**
 * Room-create options for a bot game. Never ranked, no timers: the room reads the bot's deck, and your own
 * deck goes with your join.
 */
export function botCreateOptions(level: BotLevel, botDeck: SavedDeck): DuelCreateOptions {
  return { ranked: false, bot: { level, deck: deckToWire(botDeck) }, timer: {} };
}
