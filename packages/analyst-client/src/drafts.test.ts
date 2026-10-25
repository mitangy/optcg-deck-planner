import { describe, expect, it } from "vitest";
import { deckListText, markDraftOpened, OPENED_DRAFTS_KEY, parseDraft, readOpenedDrafts, shouldAutoOpen, type NewDeckDraft } from "./drafts";

const wire = {
  id: "d1",
  version: 1,
  name: "Red Luffy",
  leader_id: "ST01-001",
  leader_name: "Monkey.D.Luffy",
  summary: "Plain red beats.",
  cards: [
    { id: "ST01-003", name: "Nami", copies: 4 },
    { id: "st01-015_p1", name: "Gum-Gum Jet Pistol", copies: 2 },
  ],
  count: 6,
  legality: { legal: true, problems: [], upcoming: ["ST01-003 is banned (from 2031-01-01)"], ban_list_checked: true },
};
const draft = (): NewDeckDraft => parseDraft(wire)!;

describe("new deck drafts (#726)", () => {
  it("reads a draft and normalizes card numbers (#726)", () => {
    expect(draft()).toMatchObject({
      id: "d1",
      name: "Red Luffy",
      leaderId: "ST01-001",
      leaderName: "Monkey.D.Luffy",
      summary: "Plain red beats.",
      legality: { legal: true, problems: [], upcoming: ["ST01-003 is banned (from 2031-01-01)"], banListChecked: true },
    });
    expect(draft().cards.map((c) => c.id)).toEqual(["ST01-003", "ST01-015"]);
  });

  it("drops malformed cards and refuses a draft with no usable cards or leader (#726)", () => {
    const p = parseDraft({ ...wire, cards: [...wire.cards, { id: "ST01-004", name: "x", copies: 0 }, { id: "ST01-005", name: "x", copies: 5 }, { id: "ST01-006", name: "x", copies: 1.5 }, "junk", { name: "no id", copies: 1 }] })!;
    expect(p.cards.map((c) => c.id)).toEqual(["ST01-003", "ST01-015"]);
    expect(parseDraft({ ...wire, cards: [{ id: "ST01-004", name: "x", copies: 0 }] })).toBeNull();
    expect(parseDraft({ ...wire, leader_id: undefined })).toBeNull();
    expect(parseDraft({ ...wire, id: undefined })).toBeNull();
  });

  it("writes the list with the leader first, in the form both apps' importers read (#726)", () => {
    expect(deckListText(draft())).toBe("1xST01-001\n4xST01-003\n2xST01-015");
  });

  it("auto-opens a live draft once, never a reloaded or already opened one (#726)", () => {
    expect(shouldAutoOpen(draft(), [], true)).toBe(true);
    expect(shouldAutoOpen(draft(), [], false)).toBe(false);
    expect(shouldAutoOpen(draft(), ["d1"], true)).toBe(false);
    expect(shouldAutoOpen(draft(), new Set(["d1"]), true)).toBe(false);
    expect(shouldAutoOpen(draft(), ["other"], true)).toBe(true);
  });

  it("remembers opened drafts on this device, newest 200, and survives blocked storage (#726)", () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    expect(readOpenedDrafts(storage)).toEqual([]);
    markDraftOpened("d1", storage);
    markDraftOpened("d1", storage);
    expect(readOpenedDrafts(storage)).toEqual(["d1"]);
    expect(JSON.parse(data.get(OPENED_DRAFTS_KEY)!)).toEqual(["d1"]);
    for (let i = 0; i < 205; i++) markDraftOpened(`e${i}`, storage);
    expect(readOpenedDrafts(storage)).toHaveLength(200);
    expect(readOpenedDrafts(storage)).not.toContain("d1");
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(readOpenedDrafts(blocked)).toEqual([]);
    expect(() => markDraftOpened("x", blocked)).not.toThrow();
  });
});
