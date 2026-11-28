import playbookDecks from "./sim/playbook-decks.json" with { type: "json" };

export interface BotMetaDeckEntry {
  leaderId: string;
  deck: readonly string[];
}

export const BOT_META_DECK_COUNT = 10;

/**
 * The deck lists without display names. The named list in `botMetaDecks.ts` needs the 1.4 MB card table for
 * leader names, so the duel web entry imports this module and names the decks from its own lazily loaded catalog (#1501).
 */
export const BOT_META_DECK_LIST: readonly BotMetaDeckEntry[] = (playbookDecks as unknown as { leaderId: string; deck: string[] }[])
  .slice(0, BOT_META_DECK_COUNT)
  .map((d) => ({ leaderId: d.leaderId, deck: d.deck }));

export interface BotMetaDeck extends BotMetaDeckEntry {
  name: string;
}

/** Two entries sharing a leader name get the card id appended so the picker can tell them apart. */
export function nameBotMetaDecks(list: readonly BotMetaDeckEntry[], leaderName: (leaderId: string) => string): BotMetaDeck[] {
  return list.map((d) => {
    const name = leaderName(d.leaderId);
    const shared = list.filter((o) => leaderName(o.leaderId) === name).length > 1;
    return { leaderId: d.leaderId, name: shared ? `${name} (${d.leaderId})` : name, deck: d.deck };
  });
}
