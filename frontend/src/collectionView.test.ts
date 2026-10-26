import { describe, expect, it } from "vitest";
import { cardHasColor, filterOwnedCards, typesPresent } from "./collectionView";

const c = (card_id: string, color: string, card_type: string, used_in: string[] = []) => ({
  card_id,
  name: card_id,
  color,
  card_type,
  used_in,
});
const items = [
  c("A", "Red", "Leader"),
  c("B", "Green", "Character", ["Deck 1"]),
  c("C", "Red/Green", "Event"),
  c("D", "Blue", "Character"),
  c("E", "Purple", "Stage"),
];
const none = { colors: [], type: "", sparesOnly: false, search: "" };
const ids = (list: { card_id: string }[]) => list.map((i) => i.card_id);

describe("Collection filters", () => {
  it("a type chip keeps only that type, whatever its capitalisation (#752)", () => {
    expect(ids(filterOwnedCards(items, { ...none, type: "Character" }))).toEqual(["B", "D"]);
    expect(ids(filterOwnedCards([c("X", "Red", "event")], { ...none, type: "Event" }))).toEqual(["X"]);
  });

  it("several colour chips show cards of any of those colours, and a two-colour card matches either (#752)", () => {
    expect(ids(filterOwnedCards(items, { ...none, colors: ["Green"] }))).toEqual(["B", "C"]);
    expect(ids(filterOwnedCards(items, { ...none, colors: ["Blue", "Purple"] }))).toEqual(["D", "E"]);
    expect(cardHasColor({ color: "Red/Green" }, ["green"])).toBe(true);
  });

  it("colour, type and Not in a deck narrow together (#752)", () => {
    const f = { ...none, colors: ["Green"], type: "Character" };
    expect(ids(filterOwnedCards(items, f))).toEqual(["B"]);
    expect(ids(filterOwnedCards(items, { ...f, sparesOnly: true }))).toEqual([]);
    expect(ids(filterOwnedCards(items, { ...none, sparesOnly: true }))).toEqual(["A", "C", "D", "E"]);
  });

  it("type chips are offered only for types in the collection, in the usual order (#752)", () => {
    expect(typesPresent(items)).toEqual(["Leader", "Character", "Event", "Stage"]);
    expect(typesPresent([c("A", "Red", "Stage"), c("B", "Red", "Leader"), c("C", "", "DON!!")])).toEqual(["Leader", "Stage"]);
  });
});
