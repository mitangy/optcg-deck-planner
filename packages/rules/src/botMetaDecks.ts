import { cardDataFor } from "./cards/cardData.js";
import playbookDecks from "./sim/playbook-decks.json" with { type: "json" };

/** One bundled tournament list the Play vs Bot picker offers (#1180). */
export interface BotMetaDeck {
  leaderId: string;
  /** The Leader's name, with its card number added when two lists share a name ("Monkey.D.Luffy (OP13-001)"). */
  name: string;
  /** The 50 main-deck card ids. */
  deck: readonly string[];
}

/** How many of the meta lists (the top of the file, ordered by meta share) the bot can be given. */
export const BOT_META_DECK_COUNT = 10;

const top = (playbookDecks as unknown as { leaderId: string; deck: string[] }[]).slice(0, BOT_META_DECK_COUNT);
const leaderName = (leaderId: string) => cardDataFor(leaderId)?.name ?? leaderId;

/**
 * The top 10 leaders' recent tournament lists (Limitless TCG), the ones the bots have playbooks for.
 * The source of truth is `sim/playbook-decks.json`, so refreshing it updates the bots and this list together.
 */
export const BOT_META_DECKS: readonly BotMetaDeck[] = top.map((d) => {
  const name = leaderName(d.leaderId);
  const shared = top.filter((o) => leaderName(o.leaderId) === name).length > 1;
  return { leaderId: d.leaderId, name: shared ? `${name} (${d.leaderId})` : name, deck: d.deck };
});
