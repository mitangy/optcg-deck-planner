import { cardDataFor } from "./cards/cardData.js";
import playbookDecks from "./sim/playbook-decks.json" with { type: "json" };

export interface BotMetaDeck {
  leaderId: string;
  name: string;
  deck: readonly string[];
}

export const BOT_META_DECK_COUNT = 10;

const top = (playbookDecks as unknown as { leaderId: string; deck: string[] }[]).slice(0, BOT_META_DECK_COUNT);
const leaderName = (leaderId: string) => cardDataFor(leaderId)?.name ?? leaderId;

/** The source of truth is `sim/playbook-decks.json`, so refreshing it updates the bots and this list together. */
export const BOT_META_DECKS: readonly BotMetaDeck[] = top.map((d) => {
  const name = leaderName(d.leaderId);
  const shared = top.filter((o) => leaderName(o.leaderId) === name).length > 1;
  return { leaderId: d.leaderId, name: shared ? `${name} (${d.leaderId})` : name, deck: d.deck };
});
