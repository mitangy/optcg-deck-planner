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

export const BOT_DECK_RANDOM = "__random__";

export const BOT_DECK_RANDOM_META = "__random_meta__";

const META_PREFIX = "meta:";

export const metaDeckValue = (leaderId: string): string => `${META_PREFIX}${leaderId}`;

export const isBotMetaValue = (value: string): boolean => value === BOT_DECK_RANDOM_META || value.startsWith(META_PREFIX);

export function metaSavedDeck(m: BotMetaDeck): SavedDeck {
  return { id: metaDeckValue(m.leaderId), name: m.name, leaderId: m.leaderId, cards: [...m.deck], updatedAt: 0 };
}

export function pickRandomDeck(decks: SavedDeck[], rand: () => number = Math.random): SavedDeck | null {
  let pool = decks.filter((d) => !isIncompleteDeck(d));
  if (pool.length === 0) pool = decks;
  if (pool.length === 0) return null;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]!;
}

export function resolveBotDeck(decks: SavedDeck[], pickedId: string, rand: () => number = Math.random): SavedDeck {
  const meta = BOT_META_DECKS.find((m) => metaDeckValue(m.leaderId) === pickedId);
  if (meta) return metaSavedDeck(meta);
  const own = decks.find((d) => d.id === pickedId);
  if (own) return own;
  return metaSavedDeck(BOT_META_DECKS[Math.min(BOT_META_DECKS.length - 1, Math.floor(rand() * BOT_META_DECKS.length))]!);
}

export function botCreateOptions(level: BotLevel, botDeck: SavedDeck): DuelCreateOptions {
  return { ranked: false, bot: { level, deck: deckToWire(botDeck) }, timer: {} };
}
