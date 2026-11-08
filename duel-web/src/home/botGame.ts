/** Play vs Bot (#631): the options of a room whose second seat is the server's bot. */
import { deckToWire, type SavedDeck } from "../decks/storage";
import type { DuelCreateOptions } from "../net/protocol";
import { isIncompleteDeck } from "../decks/deckStatus";
import { BOT_META_DECKS, type BotMetaDeck } from "@optcg/rules/botMetaDecks";

export type BotLevel = "easy" | "normal" | "hard";

export const BOT_LEVELS: ReadonlyArray<{ level: BotLevel; label: string; hint: string }> = [
  { level: "easy", label: "Easy", hint: "A relaxed opponent that is easy to beat." },
  { level: "normal", label: "Normal", hint: "A tougher opponent that plays to win." },
  { level: "hard", label: "Hard", hint: "Thinks ahead: tries its Leader and Character effects and saves Counter Events for the hits that matter. It may pause to think." },
];

export const DEFAULT_BOT_LEVEL: BotLevel = "normal";

/** Value of a deck picker meaning "a random deck, chosen when the game starts" (#994). */
export const BOT_DECK_RANDOM = "__random__";

/** Bot's deck picker (#1180): one of the bundled meta decks, drawn when the game starts. The default. */
export const BOT_DECK_RANDOM_META = "__random_meta__";

const META_PREFIX = "meta:";

/** The picker value of a meta deck. */
export const metaDeckValue = (leaderId: string): string => `${META_PREFIX}${leaderId}`;

/** True for the picker values the bot's deck can hold without a saved deck behind them. */
export const isBotMetaValue = (value: string): boolean => value === BOT_DECK_RANDOM_META || value.startsWith(META_PREFIX);

/** A bundled meta list in the shape the rest of the lobby uses for decks (never saved). */
export function metaSavedDeck(m: BotMetaDeck): SavedDeck {
  return { id: metaDeckValue(m.leaderId), name: m.name, leaderId: m.leaderId, cards: [...m.deck], updatedAt: 0 };
}

/** A random saved deck: complete decks only (all decks when none is complete). */
export function pickRandomDeck(decks: SavedDeck[], rand: () => number = Math.random): SavedDeck | null {
  let pool = decks.filter((d) => !isIncompleteDeck(d));
  if (pool.length === 0) pool = decks;
  if (pool.length === 0) return null;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]!;
}

/**
 * The deck the bot plays (#1180): the meta deck picked, a random meta deck, or one of your saved decks. A pick
 * that is no longer there (a deleted deck, a meta list that left the top 10) falls back to a random meta deck.
 */
export function resolveBotDeck(decks: SavedDeck[], pickedId: string, rand: () => number = Math.random): SavedDeck {
  const meta = BOT_META_DECKS.find((m) => metaDeckValue(m.leaderId) === pickedId);
  if (meta) return metaSavedDeck(meta);
  const own = decks.find((d) => d.id === pickedId);
  if (own) return own;
  return metaSavedDeck(BOT_META_DECKS[Math.min(BOT_META_DECKS.length - 1, Math.floor(rand() * BOT_META_DECKS.length))]!);
}

/**
 * Room-create options for a bot game. Never ranked, no timers: the room reads the bot's deck, and your own
 * deck goes with your join.
 */
export function botCreateOptions(level: BotLevel, botDeck: SavedDeck): DuelCreateOptions {
  return { ranked: false, bot: { level, deck: deckToWire(botDeck) }, timer: {} };
}
