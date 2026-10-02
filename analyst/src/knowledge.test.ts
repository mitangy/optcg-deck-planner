import { describe, expect, it } from "vitest";
import { loadCatalog } from "./catalog";
import type { Deck } from "./decks";
import { cardRulings, deckBanCheck } from "./knowledge";
import { banListProblems, parseBanList, type BanList } from "./official/banlist";
import { parseErrata } from "./official/errata";
import { OfficialLibrary, type FaqSet } from "./official/library";
import type { PdfItem } from "./official/pdf";
import { parseFaqIndex, parseQaTable } from "./official/qa";
import { parseRules, searchRules } from "./official/rules";
import { newestFormat, parseNote, queryPlaybook, type Playbook } from "./playbook";

const catalog = loadCatalog();

describe("comprehensive rules", () => {
  // Made-up rules text in the PDF's shape: numbered lines, wrapped lines, a contents page and page numbers.
  const lines = [
    "Sample Card Game Comprehensive Rules",
    "Version 9.9",
    "Last updated: 1/2/2030",
    "1. Overview .......................... 1",
    "1. Overview",
    "1-1. Players",
    "1-1-1. Two players face off. A third player",
    "2. may not join.",
    "7",
    "1-1-2. Concede at any time, even while a guard is up.",
    "2. Battles",
    "2-1. [Guard]",
    "2-1-1. Each battle allows one guard.",
    "2-2. Damage",
    "2-2-1. A guard card can still take damage when no guard is used.",
  ];

  it("splits numbered sections and keeps wrapped lines in their section (#246)", () => {
    const doc = parseRules(lines);
    expect(doc.version).toBe("9.9");
    expect(doc.sections.map((s) => s.id)).toEqual(["1", "1-1", "1-1-1", "1-1-2", "2", "2-1", "2-1-1", "2-2", "2-2-1"]);
    // "2. may not join." wraps 1-1-1 (chapter 2 can't start before 1-1-2), and the page number is dropped.
    expect(doc.sections.find((s) => s.id === "1-1-1")!.text).toBe("Two players face off. A third player 2. may not join.");
  });

  it("ranks the heading that names a keyword above earlier mentions (#246)", () => {
    const doc = parseRules(lines);
    expect(searchRules(doc, "guard", 3).map((s) => s.id)[0]).toBe("2-1");
  });
});

/** A FAQ page as positioned runs: header, then rows whose label sits centred below the row's first line. */
function faqPages(): PdfItem[][] {
  const run = (x: number, y: number, str: string): PdfItem => ({ x, y, w: str.length * 4, str });
  const page1 = [
    run(28, 768, "Card No."),
    run(95, 767, "Card Name"),
    run(250, 767, "Question"),
    run(455, 767, "Answer"),
    // Row 1: two-line question, three-line answer, label lower down in the row.
    run(170, 730, "Can this card attack"),
    run(170, 718, "on the turn it is played?"),
    run(372, 730, "Yes, it can attack"),
    run(372, 718, "because it has"),
    run(372, 706, "Rush."),
    run(24, 684, "ZZ01-001"),
    run(70, 685, "Sample Hero"),
    // Row 2: one-line question; the long card name wraps, so the label starts above the question line.
    run(170, 628, "Does the effect stack?"),
    run(372, 628, "No, it does not."),
    run(24, 634, "ZZ01-002"),
    run(70, 634, "Sample"),
    run(70, 622, "Rival"),
    // Row 3 starts at the bottom and carries on over the page break.
    run(170, 120, "If my opponent has no"),
    run(170, 108, "Characters, what happens?"),
    run(372, 120, "Nothing happens, and"),
    run(24, 80, "ZZ01-003"),
    run(70, 81, "Sample Mentor"),
    run(500, 40, "3"),
  ];
  const page2 = [
    run(170, 780, "Is it still once per turn?"),
    run(372, 780, "the effect ends."),
  ];
  return [page1, page2];
}

describe("official FAQ tables", () => {
  it("matches each question and answer to its card even when the label sits below the row's first line (#246)", () => {
    const entries = parseQaTable(faqPages());
    expect(entries.map((e) => [e.cardId, e.label])).toEqual([
      ["ZZ01-001", "Sample Hero"],
      ["ZZ01-002", "Sample Rival"],
      ["ZZ01-003", "Sample Mentor"],
    ]);
    expect(entries[0]).toMatchObject({ question: "Can this card attack on the turn it is played?", answer: "Yes, it can attack because it has Rush." });
    expect(entries[1]).toMatchObject({ question: "Does the effect stack?", answer: "No, it does not." });
  });

  it("joins a row that runs over a page break (#246)", () => {
    const last = parseQaTable(faqPages())[2]!;
    expect(last.question).toBe("If my opponent has no Characters, what happens? Is it still once per turn?");
    expect(last.answer).toBe("Nothing happens, and the effect ends.");
  });

  it("reads which sets each FAQ file covers from its name (#246)", () => {
    const html = ["qa_rules.pdf?1", "qa_st-01-st-04.pdf?2", "qa_op14_eb04.pdf?3", "faq_op15-eb04.pdf?4", "qa_promotion-cards.pdf?5", "qa_st-15-20.pdf?6"]
      .map((f) => `<a href="/pdf/${f}">x</a>`)
      .join("");
    const files = parseFaqIndex(html, "https://example.test/rules/faq/");
    expect(files.map((f) => [f.general, f.sets.join(",")])).toEqual([
      [true, ""],
      [false, "ST01,ST02,ST03,ST04"],
      [false, "OP14,EB04"],
      [false, "OP15,EB04"],
      [false, "P"],
      [false, "ST15,ST16,ST17,ST18,ST19,ST20"],
    ]);
    expect(files[1]!.url).toBe("https://example.test/pdf/qa_st-01-st-04.pdf?2");
  });
});

// Made-up page in the shape of the official ban list news page.
const banPage = `
<h3>Banned/Restricted Cards effective from March 3, 2031</h3>
<h4>Banned Cards</h4><h5>ZZ02-010 Future Ban</h5>
<h3>Cards with Active Restrictions</h3>
<h4>Banned Cards</h4><ul><li><a>ZZ01-005 Old Ban</a></li><li><a>ZZ01-006 Older Ban</a></li></ul>
<h4>Restricted Cards</h4><ul><li><a>ZZ01-007 One Copy</a></li></ul>
<h4>Banned Pair Cards</h4>
<ul><li><a>ZZ01-008 Pair A</a></li><li><a>ZZ01-009 Pair B</a></li></ul>
<ul><li><a>ZZ01-008 Pair A</a></li><li><a>ZZ01-011 Pair C</a></li></ul>`;

describe("ban list", () => {
  it("keeps announced bans upcoming until their date, then applies them (#246)", () => {
    const before = parseBanList(banPage, "2031-03-02", "u");
    expect(before.banned).toEqual(["ZZ01-005", "ZZ01-006"]);
    expect(before.upcoming).toEqual([{ effective: "2031-03-03", banned: ["ZZ02-010"], restricted: [], unbanned: [] }]);
    const after = parseBanList(banPage, "2031-03-03", "u");
    expect(after.banned).toEqual(["ZZ01-005", "ZZ01-006", "ZZ02-010"]);
    expect(after.upcoming).toEqual([]);
  });

  it("reads each banned pair from its own list (#246)", () => {
    const list = parseBanList(banPage, "2031-01-01", "u");
    expect(list.restricted).toEqual(["ZZ01-007"]);
    expect(list.bannedPairs).toEqual([
      ["ZZ01-008", "ZZ01-009"],
      ["ZZ01-008", "ZZ01-011"],
    ]);
  });

  it("flags banned cards, a second restricted copy and both halves of a pair (#246)", () => {
    const list = parseBanList(banPage, "2031-01-01", "u");
    const problems = (cards: { id: string; copies: number }[]) => banListProblems(list, cards, "ZZ01-001").map((p) => p.cards.join("+"));
    expect(problems([{ id: "ZZ01-007", copies: 1 }, { id: "ZZ01-008", copies: 4 }])).toEqual([]);
    expect(problems([{ id: "ZZ01-007", copies: 2 }, { id: "ZZ01-008", copies: 4 }, { id: "ZZ01-011", copies: 1 }, { id: "ZZ01-005", copies: 1 }])).toEqual([
      "ZZ01-005",
      "ZZ01-007",
      "ZZ01-008+ZZ01-011",
    ]);
  });
});

describe("errata", () => {
  it("takes the date from the card heading when an entry carries its own, and skips alt-art repeats (#246)", () => {
    const entry = (heading: string, after: string) =>
      `<h5>${heading}</h5><dl><dt>Before:</dt><dd>Old text.</dd><dt>After:</dt><dd>${after}</dd></dl>`;
    const html = `<h4>May 1, 2030</h4>${entry("ZZ01-001 Sample Hero", "New<br>text.")}${entry("June 2, 2029<br>ZZ01-002 Sample Rival", "Fixed.")}${entry(
      "June 2, 2029<br>ZZ01-002 Sample Rival",
      "Fixed.",
    )}`;
    expect(parseErrata(html)).toEqual([
      { cardId: "ZZ01-001", name: "Sample Hero", date: "May 1, 2030", before: "Old text.", after: "New\ntext." },
      { cardId: "ZZ01-002", name: "Sample Rival", date: "June 2, 2029", before: "Old text.", after: "Fixed." },
    ]);
  });
});

describe("official library cache", () => {
  it("serves the last good copy when a refresh fails, and refreshes after the cache time (#246)", async () => {
    let now = 0;
    let page = banPage;
    let fail = false;
    const lib = new OfficialLibrary({
      baseUrl: "https://example.test",
      ttlMs: 1000,
      now: () => new Date(Date.UTC(2031, 0, 1) + now),
      fetchImpl: (async () => (fail ? new Response("down", { status: 503 }) : new Response(page))) as typeof fetch,
    });
    expect((await lib.banList()).banned).toEqual(["ZZ01-005", "ZZ01-006"]);
    page = banPage.replace("ZZ01-006 Older Ban", "ZZ01-012 New Ban");
    now = 500;
    expect((await lib.banList()).banned).toEqual(["ZZ01-005", "ZZ01-006"]);
    now = 1500;
    expect((await lib.banList()).banned).toEqual(["ZZ01-005", "ZZ01-012"]);
    fail = true;
    now = 3000;
    expect((await lib.banList()).banned).toEqual(["ZZ01-005", "ZZ01-012"]);
  });
});

/** A library with fixed answers, so tool output can be checked without the official site. */
class FixedLibrary extends OfficialLibrary {
  constructor(private readonly list: BanList, private readonly faqSet: FaqSet) {
    super({ baseUrl: "https://example.test" });
  }
  override banList() {
    return Promise.resolve(this.list);
  }
  override faq() {
    return Promise.resolve(this.faqSet);
  }
  override errata() {
    return Promise.resolve([]);
  }
}

const realIds = { banned: "OP06-086", soon: "OP14-020", pairA: "OP11-040", pairB: "OP11-067", plain: "OP01-016", leader: "OP01-001" };
const fixedList: BanList = {
  banned: [realIds.banned],
  restricted: [],
  bannedPairs: [[realIds.pairA, realIds.pairB]],
  upcoming: [{ effective: "2031-03-03", banned: [realIds.soon], restricted: [], unbanned: [] }],
  sourceUrl: "u",
};

describe("card rulings and deck legality", () => {
  const faqSet: FaqSet = {
    entries: [
      { cardId: realIds.plain, label: "Nami", question: "Q1?", answer: "A1." },
      { cardId: realIds.leader, label: "Zoro", question: `Does ${realIds.plain} get +1000?`, answer: "Yes." },
    ],
    general: [],
    files: 2,
    failed: [],
  };
  const lib = new FixedLibrary(fixedList, faqSet);

  it("gives each card's own rulings, rulings that mention it, and its ban status including announced bans (#246)", async () => {
    const out = await cardRulings(lib, catalog, [realIds.plain, realIds.soon, realIds.pairA]);
    const [plain, soon, pair] = out.cards;
    expect(plain!.rulings).toEqual([{ question: "Q1?", answer: "A1." }]);
    expect(plain!.mentionedIn.map((m) => m.cardId)).toEqual([realIds.leader]);
    expect(plain!.banStatus).toBe("legal");
    expect(soon!.banStatus).toBe("banned from 2031-03-03");
    expect(pair!.banStatus).toBe(`can't share a deck with ${realIds.pairB}`);
  });

  it("lists ban problems now and the ones an announced change will add (#246)", async () => {
    const deck: Deck = { leaderId: realIds.leader, cards: [{ id: realIds.banned, copies: 1 }, { id: realIds.soon, copies: 2 }], unknown: [], warnings: [] };
    const check = await deckBanCheck(lib, deck);
    expect(check.problems.map((p) => p.cards)).toEqual([[realIds.banned]]);
    expect(check.upcoming.map((p) => [p.cards, p.effective])).toEqual([[[realIds.soon], "2031-03-03"]]);
  });
});

describe("playbook", () => {
  const note = (leader: string, format: string, vs: string) => `---
leader: ${leader}
name: Leader ${leader}
colors: [red, green]
format: ${format}
updated: 2030-01-01
status: draft
---

## Game plan
Plan for ${leader}.

## Matchups
### vs ${vs} Someone
${leader} thoughts on ${vs}.
`;
  const a = parseNote(note("ZZ01-001", "OP17", "ZZ02-001"))!;
  const b = parseNote(note("ZZ02-001", "OP16", "ZZ01-001"))!;
  const book: Playbook = { notes: new Map([[a.leader, a], [b.leader, b]]), general: null };

  it("reads front matter, sections and matchups by opponent leader (#246)", () => {
    expect(a.colors).toEqual(["red", "green"]);
    expect(a.sections["Game plan"]).toBe("Plan for ZZ01-001.");
    expect(a.matchups["ZZ02-001"]!.text).toBe("ZZ01-001 thoughts on ZZ02-001.");
  });

  it("gives both sides of a matchup and flags notes older than the current set (#246)", () => {
    const r = queryPlaybook(book, { leader: "zz01-001", opponent: "ZZ02-001" }, "OP17") as Record<string, any>;
    expect(r.fromLeaderSide.text).toBe("ZZ01-001 thoughts on ZZ02-001.");
    expect(r.fromOpponentSide.text).toBe("ZZ02-001 thoughts on ZZ01-001.");
    expect(r.leader.stale).toBe(false);
    expect(r.opponent.stale).toBe(true);
  });

  it("takes the newest booster with a full card list as the current set (#246)", () => {
    const ids = [...Array.from({ length: 60 }, (_, i) => `OP17-${String(i + 1).padStart(3, "0")}`), "OP18-001", "OP18-002", "OP09-001"];
    expect(newestFormat(ids)).toBe("OP17");
  });
});
