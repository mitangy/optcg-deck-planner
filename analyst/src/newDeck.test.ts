import { describe, expect, it } from "vitest";
import { loadCatalog } from "./catalog";
import { newDeckTool, NEW_DECK_TOO_MANY_ERROR, proposeNewDeck, type NewDeckInput } from "./newDeck";
import type { BanList } from "./official/banlist";
import type { OfficialLibrary } from "./official/library";

const catalog = loadCatalog();

// Mono-red Luffy: 12 distinct plain red cards at 4 plus 2 more, 50 in all.
const LEADER = "ST01-001";
const MAIN = [
  ...["ST01-003", "ST01-004", "ST01-005", "ST01-006", "ST01-007", "ST01-008", "ST01-009", "ST01-010", "ST01-011", "ST01-012", "ST01-013", "ST01-014"].map((id) => ({ id, copies: 4 })),
  { id: "ST01-015", copies: 2 },
];
const BLUE = [...catalog.cards.values()].find((c) => c.type === "character" && c.colors.length === 1 && !c.colors.includes("red"))!.id;
const library = (list: Partial<BanList>): OfficialLibrary =>
  ({ banList: async () => ({ banned: [], restricted: [], bannedPairs: [], upcoming: [], sourceUrl: "u", ...list }) }) as unknown as OfficialLibrary;

const input = (over: Partial<NewDeckInput> = {}): NewDeckInput => ({ name: "Red Luffy", leader_id: LEADER, cards: MAIN, summary: "Plain red beats.", ...over });
const refused = async (p: ReturnType<typeof proposeNewDeck>) => {
  const r = await p;
  if (r.ok) throw new Error("expected a refusal");
  return r.error;
};

describe("propose_new_deck (#726)", () => {
  it("accepts a legal 50-card list and names the leader and cards (#726)", async () => {
    const r = await proposeNewDeck(catalog, undefined, input());
    if (!r.ok) throw new Error(r.error);
    expect(r.draft).toMatchObject({ version: 1, name: "Red Luffy", leader_id: LEADER, count: 50, legality: { legal: true, problems: [], ban_list_checked: false } });
    expect(r.draft.leader_name).toBe(catalog.cards.get(LEADER)!.name);
    expect(r.draft.cards).toContainEqual({ id: "ST01-015", name: catalog.cards.get("ST01-015")!.name, copies: 2 });
    expect(r.draft.cards).toHaveLength(13);
  });

  it("refuses 49 cards (#726)", async () => {
    expect(await refused(proposeNewDeck(catalog, undefined, input({ cards: [...MAIN.slice(0, 12), { id: "ST01-015", copies: 1 }] })))).toMatch(/49 of 50/);
  });

  it("refuses 51 cards (#726)", async () => {
    expect(await refused(proposeNewDeck(catalog, undefined, input({ cards: [...MAIN.slice(0, 12), { id: "ST01-015", copies: 3 }] })))).toMatch(/51 of 50/);
  });

  it("refuses a leader that is not a leader card (#726)", async () => {
    expect(await refused(proposeNewDeck(catalog, undefined, input({ leader_id: "ST01-003" })))).toMatch(/not a leader/);
    expect(await refused(proposeNewDeck(catalog, undefined, input({ leader_id: "ZZ99-999" })))).toMatch(/not a leader/);
  });

  it("refuses an off-color card (#726)", async () => {
    expect(await refused(proposeNewDeck(catalog, undefined, input({ cards: [...MAIN.slice(0, 12), { id: BLUE, copies: 2 }] })))).toMatch(/off-color/);
  });

  it("refuses a 5th copy of a card even when the list is 50 cards (#726)", async () => {
    const five = [{ id: "ST01-003", copies: 5 }, ...MAIN.slice(1, 12), { id: "ST01-015", copies: 1 }];
    expect(five.reduce((s, c) => s + c.copies, 0)).toBe(50);
    expect(await refused(proposeNewDeck(catalog, undefined, input({ cards: five })))).toMatch(/Over 4 copies/);
  });

  it("refuses a banned card using the ban list (#726)", async () => {
    expect(await refused(proposeNewDeck(catalog, library({ banned: ["ST01-014"] }), input()))).toMatch(/ST01-014 is banned/);
    const ok = await proposeNewDeck(catalog, library({}), input());
    expect(ok.ok && ok.draft.legality.ban_list_checked).toBe(true);
  });

  it("refuses unknown cards, leaders in the list, DON!! cards and a card listed twice (#726)", async () => {
    const swap = (card: { id: string; copies: number }) => input({ cards: [...MAIN.slice(0, 12), card] });
    expect(await refused(proposeNewDeck(catalog, undefined, swap({ id: "ZZ99-999", copies: 2 })))).toMatch(/not a card number/);
    expect(await refused(proposeNewDeck(catalog, undefined, swap({ id: LEADER, copies: 2 })))).toMatch(/leader/);
    expect(await refused(proposeNewDeck(catalog, undefined, swap({ id: "DON-001", copies: 2 })))).toMatch(/DON!!/);
    expect(await refused(proposeNewDeck(catalog, undefined, swap({ id: "st01-003", copies: 2 })))).toMatch(/twice/);
  });

  it("makes at most 2 drafts in one turn (#726)", async () => {
    const tool = newDeckTool(catalog, {});
    for (let i = 0; i < 2; i++) expect((await tool.run(input() as unknown as Record<string, unknown>)).isError).toBeUndefined();
    expect(await tool.run(input() as unknown as Record<string, unknown>)).toMatchObject({ isError: true, content: [{ text: NEW_DECK_TOO_MANY_ERROR }] });
  });
});
