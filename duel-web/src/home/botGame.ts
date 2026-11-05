/** Play vs Bot (#631): the options of a room whose second seat is the server's bot. */
import { deckToWire, type SavedDeck } from "../decks/storage";
import type { DuelCreateOptions } from "../net/protocol";
import { isIncompleteDeck } from "../decks/deckStatus";

export type BotLevel = "easy" | "normal" | "hard";

export const BOT_LEVELS: ReadonlyArray<{ level: BotLevel; label: string; hint: string }> = [
  { level: "easy", label: "Easy", hint: "A relaxed opponent that is easy to beat." },
  { level: "normal", label: "Normal", hint: "A tougher opponent that plays to win." },
  { level: "hard", label: "Hard", hint: "Thinks ahead: tries its Leader and Character effects and saves Counter Events for the hits that matter. It may pause to think." },
];

export const DEFAULT_BOT_LEVEL: BotLevel = "normal";

/** Value of the bot-deck picker meaning "the same deck as yours". */
export const BOT_DECK_MIRROR = "";

/** Value of a deck picker meaning "a random deck, chosen when the game starts" (#994). */
export const BOT_DECK_RANDOM = "__random__";

/**
 * A random saved deck: complete decks only (all decks when none is complete). With `avoidId` it skips that deck
 * when another candidate exists, so the bot does not draw the deck you are playing.
 */
export function pickRandomDeck(decks: SavedDeck[], avoidId: string | null, rand: () => number = Math.random): SavedDeck | null {
  let pool = decks.filter((d) => !isIncompleteDeck(d));
  if (pool.length === 0) pool = decks;
  if (pool.length > 1 && avoidId !== null) pool = pool.filter((d) => d.id !== avoidId);
  if (pool.length === 0) return null;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]!;
}

/** The deck the bot plays: a random one, the picked saved deck, else a mirror of yours (also when the pick was deleted). */
export function resolveBotDeck(decks: SavedDeck[], yours: SavedDeck, pickedId: string, rand: () => number = Math.random): SavedDeck {
  if (pickedId === BOT_DECK_RANDOM) return pickRandomDeck(decks, yours.id, rand) ?? yours;
  return decks.find((d) => d.id === pickedId) ?? yours;
}

/**
 * Room-create options for a bot game. Never ranked, no timers: the room reads the bot's deck, and your own
 * deck goes with your join.
 */
export function botCreateOptions(level: BotLevel, botDeck: SavedDeck): DuelCreateOptions {
  return { ranked: false, bot: { level, deck: deckToWire(botDeck) }, timer: {} };
}
