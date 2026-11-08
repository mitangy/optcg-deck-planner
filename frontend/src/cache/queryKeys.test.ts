import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { qk } from "./queryKeys";

/** Fill each key, invalidate one prefix, and report which of the keys went stale. */
async function staleAfter(prefix: readonly unknown[], keys: Record<string, readonly unknown[]>): Promise<string[]> {
  const qc = new QueryClient();
  for (const key of Object.values(keys)) qc.setQueryData(key, {});
  await qc.invalidateQueries({ queryKey: prefix, refetchType: "none" });
  return Object.entries(keys)
    .filter(([, key]) => qc.getQueryState(key)?.isInvalidated)
    .map(([name]) => name);
}

describe("query key factory (refactor 2.1a)", () => {
  it("invalidating a domain prefix reaches every specific key under it and nothing else", async () => {
    const keys = {
      deck: qk.deck.byId(4),
      deckFiltered: qk.deck.detail(4, [1, 2]),
      decks: qk.decks(),
      shoppingList: qk.shopping.list([1], true),
      shoppingFull: qk.shopping.full([1]),
      owned: qk.owned.collection(),
      ownedFiltered: qk.owned.collection([1]),
      groupBuy: qk.groupBuy.detail(7),
      groupBuys: qk.groupBuys(),
      friendSpares: qk.friend.spares(3),
      friendSparesFiltered: qk.friend.spares(3, [1]),
      friendDecks: qk.friend.decks(3),
      otherFriendSpares: qk.friend.spares(8),
    };
    expect(await staleAfter(qk.deck.all(), keys)).toEqual(["deck", "deckFiltered"]);
    expect(await staleAfter(qk.shopping.all(), keys)).toEqual(["shoppingList", "shoppingFull"]);
    expect(await staleAfter(qk.owned.all(), keys)).toEqual(["owned", "ownedFiltered"]);
    expect(await staleAfter(qk.groupBuy.all(), keys)).toEqual(["groupBuy"]);
    expect(await staleAfter(qk.friend.sparesAll(3), keys)).toEqual(["friendSpares", "friendSparesFiltered"]);
    expect(await staleAfter(qk.friend.all(), keys)).toEqual(["friendSpares", "friendSparesFiltered", "friendDecks", "otherFriendSpares"]);
  });

  it("one deck's prefix covers that deck under any Include-decks filter, and no other deck", async () => {
    const keys = { plain: qk.deck.detail(4), filtered: qk.deck.detail(4, [1, 2]), other: qk.deck.detail(5, [1, 2]) };
    expect(await staleAfter(qk.deck.byId(4), keys)).toEqual(["plain", "filtered"]);
  });
});
