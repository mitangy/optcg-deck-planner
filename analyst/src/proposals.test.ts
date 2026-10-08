import { describe, expect, it } from "vitest";
import { analyzeDeck } from "./analysis";
import { loadCatalog } from "./catalog";
import { deckFromLines } from "./decks";
import type { BanList } from "./official/banlist";
import type { OfficialLibrary } from "./official/library";
import { deckEditTool, NO_DECK_ERROR, proposeDeckEdit, TOO_MANY_ERROR, type ContextDeck } from "./proposals";

const catalog = loadCatalog();

// Mono-red Luffy: 12 distinct plain red cards, 50 in all.
const LEADER = "ST01-001";
const MAIN = [
  ...["ST01-003", "ST01-004", "ST01-005", "ST01-006", "ST01-007", "ST01-008", "ST01-009", "ST01-010", "ST01-011", "ST01-012", "ST01-013", "ST01-014"].map((id) => ({ id, copies: 4 })),
  { id: "ST01-015", copies: 2 },
];
const BLUE = Object.values(Object.fromEntries(catalog.cards)).find((c) => c.type === "character" && !c.colors.includes("red") && c.colors.length === 1)!.id;

const open = (cards = MAIN, extra: Partial<ContextDeck> = {}): ContextDeck => ({ name: "Luffy", leaderId: LEADER, ref: "duel:d1", cards, ...extra });
const library = (list: Partial<BanList>): OfficialLibrary =>
  ({ banList: async () => ({ banned: [], restricted: [], bannedPairs: [], upcoming: [], sourceUrl: "u", ...list }) }) as unknown as OfficialLibrary;
const change = (id: string, delta: number, reason = "Because it is better.") => ({ id, delta, reason });
const propose = (deck: ContextDeck | undefined, changes: ReturnType<typeof change>[], lib?: OfficialLibrary) =>
  proposeDeckEdit(catalog, lib, deck, { summary: "Tune the list", changes });
const refused = async (p: ReturnType<typeof propose>) => {
  const r = await p;
  if (r.ok) throw new Error("expected a refusal");
  return r.error;
};

describe("propose_deck_edit (#400)", () => {
  it("turns +2/-2 into before/after lines on the open deck and finds it legal (#400)", async () => {
    // The fixture itself is a legal 50-card deck, so a refusal below can only come from the change.
    const fixture = deckFromLines(catalog, MAIN, LEADER);
    expect(fixture.cards.length).toBeGreaterThanOrEqual(12);
    expect(analyzeDeck(catalog, fixture).legal).toBe(true);
    const r = await propose(open(), [change("ST01-015", -2), change("ST01-016", 2, "Cheaper event")]);
    if (!r.ok) throw new Error(r.error);
    // Adds come first, then removes.
    expect(r.proposal.lines.map((l) => [l.id, l.before, l.after])).toEqual([
      ["ST01-016", 0, 2],
      ["ST01-015", 2, 0],
    ]);
    expect(r.proposal.lines[0]).toMatchObject({ name: catalog.cards.get("ST01-016")!.name, reason: "Cheaper event" });
    expect(r.proposal.legality).toMatchObject({ legal: true, count: 50, problems: [], ban_list_checked: false });
    expect(r.proposal.target).toEqual({ ref: "duel:d1", name: "Luffy", leader_id: LEADER });
    expect(r.proposal.base).toContainEqual({ id: "ST01-015", copies: 2 });
  });

  it("refuses a change that puts a 5th copy in the deck (#400)", async () => {
    expect(await refused(propose(open(), [change("ST01-003", 1), change("ST01-015", -1)]))).toMatch(/Over 4 copies/);
  });

  it("refuses an off-color card (#400)", async () => {
    expect(BLUE).toBeTruthy();
    expect(await refused(propose(open(), [change(BLUE, 1), change("ST01-015", -1)]))).toMatch(/off-color/);
  });

  it("lets a change fix some of several off-color cards without adding a problem (#406)", async () => {
    const deck = open([...MAIN.slice(0, 12), { id: "EB01-012", copies: 1 }, { id: "EB01-013", copies: 1 }]);
    expect(analyzeDeck(catalog, deckFromLines(catalog, deck.cards!, LEADER)).hints.some((h) => h.tier === "rule" && h.id === "offcolor")).toBe(true);
    const r = await propose(deck, [change("EB01-013", -1), change("ST01-015", 1)]);
    expect(r.ok).toBe(true);
  });

  it("lets a change fix some of several over-limit cards without adding a problem (#406)", async () => {
    const deck = open([...MAIN.slice(0, 10), { id: "ST01-013", copies: 5 }, { id: "ST01-014", copies: 5 }]);
    const r = await propose(deck, [change("ST01-014", -1), change("ST01-016", 1)]);
    expect(r.ok).toBe(true);
  });

  it("still refuses a NEW off-color card on a deck that already has one (#406)", async () => {
    const deck = open([...MAIN.slice(0, 12), { id: "EB01-012", copies: 1 }, { id: "EB01-013", copies: 1 }]);
    const another = [...catalog.cards.values()].find((c) => c.type === "character" && c.colors.length === 1 && !c.colors.includes("red") && c.id !== "EB01-012" && c.id !== "EB01-013")!.id;
    expect(await refused(propose(deck, [change(another, 1), change("ST01-014", -1)]))).toMatch(/off-color/);
  });

  it("refuses a banned card with the ban list (#400)", async () => {
    const lib = library({ banned: ["ST01-016"] });
    expect(await refused(propose(open(), [change("ST01-016", 2), change("ST01-015", -2)], lib))).toMatch(/ST01-016 is banned/);
    // The same swap is fine when the card is not banned, and the card says the ban list was checked.
    const ok = await propose(open(), [change("ST01-016", 2), change("ST01-015", -2)], library({}));
    expect(ok.ok && ok.proposal.legality.ban_list_checked).toBe(true);
  });

  it("keeps a 50-card deck at 50 (#400)", async () => {
    expect(await refused(propose(open(), [change("ST01-016", 2)]))).toMatch(/52 of 50/);
    expect(await refused(propose(open(), [change("ST01-015", -2)]))).toMatch(/48 of 50/);
  });

  it("lets an incomplete deck move toward 50 but not away (#400)", async () => {
    const short = open(MAIN.filter((c) => c.id !== "ST01-015")); // 48 cards
    const toward = await propose(short, [change("ST01-015", 2)]);
    expect(toward.ok && toward.proposal.legality).toMatchObject({ legal: true, count: 50 });
    const stillShort = await propose(short, [change("ST01-015", 1)]);
    expect(stillShort.ok && stillShort.proposal.legality).toMatchObject({ legal: false, count: 49 });
    expect(await refused(propose(short, [change("ST01-014", -1)]))).toMatch(/47 of 50/);
  });

  it("still proposes a fix for a deck that was already illegal, listing its old problems (#400)", async () => {
    const short = open(MAIN.filter((c) => c.id !== "ST01-015")); // 48 cards
    const r = await propose(short, [change("ST01-014", -1, "Too many"), change("ST01-016", 1, "Better"), change("ST01-015", 1, "Fill")]);
    if (!r.ok) throw new Error(r.error);
    expect(r.proposal.legality).toMatchObject({ legal: false, count: 49, problems: ["49 of 50 cards"] });
  });

  it("removes only copies the deck has (#400)", async () => {
    expect(await refused(propose(open(), [change("ST01-015", -3)]))).toMatch(/has only 2 copies of ST01-015/);
    expect(await refused(propose(open(), [change("ST01-016", -1)]))).toMatch(/only 0 copies/);
  });

  it("rejects unknown cards, leaders and a card listed twice (#400)", async () => {
    expect(await refused(propose(open(), [change("ZZ99-999", 1)]))).toMatch(/not a card number/);
    expect(await refused(propose(open(), [change(LEADER, 1)]))).toMatch(/leader/);
    expect(await refused(propose(open(), [change("ST01-015", -1), change("st01-015", -1)]))).toMatch(/twice/);
  });

  it("says no deck is open when the context has no deck or no ref (#400)", async () => {
    const swap = [change("ST01-016", 2), change("ST01-015", -2)];
    expect(await refused(propose(undefined, swap))).toBe(NO_DECK_ERROR);
    expect(await refused(propose(open(MAIN, { ref: undefined }), swap))).toBe(NO_DECK_ERROR);
    expect(await refused(propose(open(MAIN, { leaderId: null }), swap))).toBe(NO_DECK_ERROR);
  });

  it("makes at most 4 proposals in one turn (#400)", async () => {
    const tool = deckEditTool(catalog, {}, open());
    const args = { summary: "Tune the list", changes: [change("ST01-016", 1), change("ST01-015", -1)] };
    for (let i = 0; i < 4; i++) expect((await tool.run(args)).isError).toBeUndefined();
    const fifth = await tool.run(args);
    expect(fifth).toMatchObject({ isError: true, content: [{ text: TOO_MANY_ERROR }] });
  });
});
