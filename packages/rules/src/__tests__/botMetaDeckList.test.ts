import { describe, expect, it } from "vitest";
import { BOT_META_DECK_LIST, nameBotMetaDecks } from "../botMetaDeckList.js";
import { BOT_META_DECKS } from "../botMetaDecks.js";

const entry = (leaderId: string) => ({ leaderId, deck: ["X-001"] });

describe("bot meta deck names (#1501)", () => {
  it("adds the card id to leaders that share a name, and only to those (#1501)", () => {
    const names = { A: "Luffy", B: "Luffy", C: "Zoro" } as Record<string, string>;
    const named = nameBotMetaDecks([entry("A"), entry("B"), entry("C")], (id) => names[id]!);
    expect(named.map((d) => d.name)).toEqual(["Luffy (A)", "Luffy (B)", "Zoro"]);
  });

  it("the card-table version names the same decks as the plain list (#1501)", () => {
    expect(BOT_META_DECKS.map((d) => d.leaderId)).toEqual(BOT_META_DECK_LIST.map((d) => d.leaderId));
    for (const d of BOT_META_DECKS) expect(d.name).not.toBe(d.leaderId);
  });
});
