import { describe, expect, it } from "vitest";
import { buildSources } from "./citations";
import { citedCardNames, findMentions } from "./mentions";

const all = () => true;
const NONE = new Map<string, string>();
const hits = (parts: ReturnType<typeof findMentions>) => parts.filter((p) => typeof p !== "string").map((p) => (p as { text: string; id: string }).text);

describe("card mentions in a Log Pose answer (#533)", () => {
  it("finds card numbers of every printed shape and cuts the text around them (#533)", () => {
    const text = "Play OP01-006 then ST13-007, EB02-023, PRB01-001 and P-001.";
    const parts = findMentions(text, NONE, all);
    expect(hits(parts)).toEqual(["OP01-006", "ST13-007", "EB02-023", "PRB01-001", "P-001"]);
    expect(parts.map((p) => (typeof p === "string" ? p : p.text)).join("")).toBe(text);
  });

  it("does not treat parts of longer codes or words as a card number (#533)", () => {
    expect(hits(findMentions("XOP01-006 OP01-0061 OP01-006-2 OP1-006 AOP-001 see 6-5-3", NONE, all))).toEqual([]);
  });

  it("skips a card that has no picture (#533)", () => {
    expect(hits(findMentions("OP01-006 and OP02-001", NONE, (id) => id === "OP02-001"))).toEqual(["OP02-001"]);
  });

  it("finds the cited card names as whole words, the longest first (#533)", () => {
    const names = new Map([
      ["Luffy", "OP01-003"],
      ["Monkey.D.Luffy", "OP05-060"],
      ["Nami", "OP01-016"],
      ["Nami Navigator", "OP03-040"],
    ]);
    expect(hits(findMentions("Monkey.D.Luffy swings, Luffy follows; Luffys and ALuffy are not it.", names, all))).toEqual(["Monkey.D.Luffy", "Luffy"]);
    expect(findMentions("Nami Navigator", names, all)).toEqual([{ text: "Nami Navigator", id: "OP03-040" }]);
  });

  it("matches names with the exact case (#533)", () => {
    expect(hits(findMentions("luffy and LUFFY", new Map([["Luffy", "OP01-003"]]), all))).toEqual([]);
  });

  it("looks up a name's picture by its card number (#533)", () => {
    const seen: string[] = [];
    findMentions("Zoro", new Map([["Zoro", "OP01-001"]]), (id) => (seen.push(id), true));
    expect(seen).toEqual(["OP01-001"]);
  });

  it("takes names only from cited cards, the host's name before the citation title's (#533)", () => {
    const { entries } = buildSources([
      { at: 1, source: "card:OP01-001", title: "Roronoa Zoro (OP01-001)", cited_text: "" },
      { at: 2, source: "card:OP01-006", title: "Wrong Title (OP01-006)", cited_text: "" },
      { at: 3, source: "rule:6-5-3", title: "Rule Name", cited_text: "" },
    ]);
    const names = citedCardNames(entries, (id) => (id === "OP01-006" ? "Otama" : undefined));
    expect([...names]).toEqual([
      ["Roronoa Zoro", "OP01-001"],
      ["Otama", "OP01-006"],
    ]);
  });
});
