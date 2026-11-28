import { cardDataFor } from "./cards/cardData.js";
import { BOT_META_DECK_COUNT, BOT_META_DECK_LIST, nameBotMetaDecks, type BotMetaDeck } from "./botMetaDeckList.js";

export { BOT_META_DECK_COUNT, type BotMetaDeck };

/** The source of truth is `sim/playbook-decks.json`, so refreshing it updates the bots and this list together. */
export const BOT_META_DECKS: readonly BotMetaDeck[] = nameBotMetaDecks(BOT_META_DECK_LIST, (id) => cardDataFor(id)?.name ?? id);
