import { BOT_META_DECK_LIST, nameBotMetaDecks, type BotMetaDeck } from "@optcg/rules/botMetaDeckList";
import { lookupCard } from "../cards/atlas";
import { cardDataReady } from "../cards/cardData";

export type { BotMetaDeck };

/** Leaders in the lists are looked up in the lazily loaded catalog, so names are cached only once it has arrived (#1501). */
let named: BotMetaDeck[] | null = null;

export function botMetaDecks(): readonly BotMetaDeck[] {
  if (named) return named;
  const list = nameBotMetaDecks(BOT_META_DECK_LIST, (id) => lookupCard(id).name);
  if (cardDataReady()) named = list;
  return list;
}

