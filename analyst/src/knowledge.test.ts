import { describe, expect, it } from "vitest";
import { loadCatalog } from "./catalog";
import type { Deck } from "./decks";
import { cardRulings, deckBanCheck, rulesLookup } from "./knowledge";
import { banListProblems, parseBanList, type BanList } from "./official/banlist";
import { parseErrata } from "./official/errata";
import { OfficialLibrary, type FaqSet } from "./official/library";
import type { PdfItem } from "./official/pdf";
import { parseFaqIndex, parseQaTable, searchQa, type QaEntry } from "./official/qa";
import { parseRules, searchRules } from "./official/rules";
import { excerpt, looksLikeTournamentQuestion, parseTournamentRules, searchTournamentRules, type TournamentDoc } from "./official/tournament";
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

  const ids = (doc: ReturnType<typeof parseRules>, q: string) => searchRules(doc, q, 3).map((s) => s.id);

  it("reads sections the PDF numbers with dots as hyphen ids, children included (#603)", () => {
    const doc = parseRules([
      "1. Turns",
      "1-1. Start",
      "1-1-1. Draw a card.",
      "1.2. Activation and Resolution",
      "1-2-1. Activate the effect.",
      "1-2-2. Resolve it and then",
      "1.2.3. If nothing remains, stop.",
    ]);
    expect(doc.sections.map((s) => s.id)).toEqual(["1", "1-1", "1-1-1", "1-2", "1-2-1", "1-2-2", "1-2-3"]);
    expect(doc.sections.find((s) => s.id === "1-2-2")!.text).toBe("Resolve it and then");
    expect(doc.sections.find((s) => s.id === "1-1-1")!.text).toBe("Draw a card.");
  });

  it("does not let question filler words pick the section (#603)", () => {
    const doc = parseRules(["1. Filler", "1-1. What does the thing do when it is on my", "1-2. A Blocker rests to protect.", "1-3. Unrelated."]);
    expect(ids(doc, "what does the blocker do when it is on my")[0]).toBe("1-2");
  });

  it("weighs a rare word above several common ones (#603)", () => {
    const doc = parseRules([
      "1. Cards",
      "1-1. Each card belongs to a player.",
      "1-2. A card is played by a player.",
      "1-3. A card is trashed by a player.",
      "1-4. A card and a player may meet.",
      "1-5. The Wizard acts.",
    ]);
    // Two common words (card, player) match 1-1 to 1-4; the one rare word still wins.
    expect(ids(doc, "card player wizard")[0]).toBe("1-5");
  });

  it("finds the rule for player slang the rules never use (#603)", () => {
    const doc = parseRules([
      "1. Cards",
      "1-1. Sickness is not a word here, nor is summoning.",
      "1-2. Played cards cannot attack on the turn in which they are played unless otherwise specified.",
      "1-3. A Character with [Rush] can attack on the turn it is played.",
      "1-4. A Character that loses a battle is K.O.'d and trashed.",
      "1-5. Characters are trashed when their cost is paid.",
    ]);
    expect(ids(doc, "summoning sickness").slice(0, 2).sort()).toEqual(["1-2", "1-3"]);
    expect(ids(doc, "does it get ko'd")[0]).toBe("1-4");
    expect(ids(doc, "knocked out")[0]).toBe("1-4");
  });

  it("maps slang to official terms for the general Q&A search too (#603)", () => {
    const entries = [
      { cardId: null, label: "Battle", question: "Can a Character with [Rush] attack the turn it is played?", answer: "Yes." },
      { cardId: null, label: "Battle", question: "Can a K.O.'d Character be returned?", answer: "No." },
      { cardId: null, label: "Battle", question: "Can a Leader be returned?", answer: "No." },
    ];
    expect(searchQa(entries, "can my character get ko", 1)[0]!.question).toContain("K.O.");
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

describe("general rules Q&A lookup", () => {
  const row = (question: string, answer = "Yes."): QaEntry => ({ cardId: null, label: "Battle", question, answer });
  const general: QaEntry[] = [
    row("Can a character attack when the battle is played?"),
    row("Can the attack target be changed when the battle ends?"),
    row("Does the attack target stay when a battle is played?"),
    row("Is the battle area the attack area when the character is played?"),
    row("Can the character attack the target when the battle is played again?"),
    row("Can a Blocker change the target of an attack?", "The target becomes the Blocker."),
  ];
  const lookup = (entries: QaEntry[], query: string, limit?: number) => {
    class Lib extends FixedLibrary {
      override rules(): ReturnType<OfficialLibrary["rules"]> {
        return Promise.reject(new Error("no rules"));
      }
    }
    return rulesLookup(new Lib(fixedList, { entries: [], general: entries, files: 1, failed: [] }), { query, limit });
  };

  it("ranks the entry with the rare question word above entries that match more common words (#414)", async () => {
    const out = await lookup(general, "attack target battle character blocker");
    expect(out.generalQa[0]!.question).toContain("Blocker");
  });

  it("puts an entry whose question has the word above one that only mentions it in the answer (#414)", async () => {
    const out = await lookup([row("Can a card be trashed?", "Yes, even a Blocker."), row("Can a Blocker be rested?", "Yes.")], "blocker");
    expect(out.generalQa[0]!.question).toContain("rested");
  });

  it("returns more than four Q&A entries (#414)", async () => {
    const many = Array.from({ length: 8 }, (_, n) => row(`Does the attack target ${n} change?`));
    expect((await lookup(many, "attack target")).generalQa).toHaveLength(6);
    expect((await lookup(many, "attack target", 2)).generalQa).toHaveLength(6);
  });
});

describe("card rulings found by topic", () => {
  const entry = (cardId: string | null, label: string, question: string, answer = "Yes."): QaEntry => ({ cardId, label, question, answer });
  const entries: QaEntry[] = [
    entry("ZZ01-001", "Alpha", "Can the attacked Character use its effect while it is active?"),
    entry("ZZ01-002", "Beta", "Can the attacked Character be played while it is active?"),
    entry("ZZ01-003", "Gamma", "Can an attacked Character use Blocker while it is rested?", "No, a rested Character cannot block."),
    entry("ZZ01-004", "Delta", "Can the attacked Character use its effect while the battle is active?"),
    entry("ZZ01-005", "Epsilon", "Can the attacked Character gain power while it is active?"),
    entry(realIds.plain, "Printed Label", "Can the attacked Character draw while it is active?"),
  ];
  const lookup = (rows: QaEntry[], query: string, limit?: number, withCatalog = true) => {
    class Lib extends FixedLibrary {
      override rules(): ReturnType<OfficialLibrary["rules"]> {
        return Promise.reject(new Error("no rules"));
      }
      override tournamentRules(): ReturnType<OfficialLibrary["tournamentRules"]> {
        return Promise.reject(new Error("no manual"));
      }
    }
    return rulesLookup(new Lib(fixedList, { entries: rows, general: [], files: 1, failed: [] }), { query, limit }, withCatalog ? catalog : undefined);
  };

  it("returns the card ruling that matches the topic, the one with the rare word first (#603)", async () => {
    const out = await lookup(entries, "attacked character blocker rested");
    expect(out.cardRulings[0]).toMatchObject({ cardId: "ZZ01-003", cardName: "Gamma", answer: "No, a rested Character cannot block." });
  });

  it("returns at most four card rulings (#603)", async () => {
    expect((await lookup(entries, "attacked character active")).cardRulings).toHaveLength(4);
  });

  it("returns fewer card rulings when the limit is smaller than four (#603)", async () => {
    expect((await lookup(entries, "attacked character active", 2)).cardRulings).toHaveLength(2);
  });

  it("leaves out a ruling that matches only one query word, even a rare one (#603)", async () => {
    const rows = [
      entry("ZZ02-001", "A", "Does Zeus follow Napoleon?"),
      entry("ZZ02-002", "B", "Does Zeus act twice?"),
      ...Array.from({ length: 6 }, (_, n) => entry(`ZZ02-01${n}`, "F", `Napoleon filler ${n}?`)),
    ];
    expect((await lookup(rows, "zeus napoleon")).cardRulings.map((r) => r.cardId)).toEqual(["ZZ02-001"]);
  });

  it("leaves out a ruling scoring under half of the best one's score (#603)", async () => {
    const rows = [
      entry("ZZ03-001", "A", "Does Zeus meet Hera?"),
      entry("ZZ03-002", "C", "Filler?", "Napoleon visits Paris."),
      ...Array.from({ length: 8 }, (_, n) => entry(`ZZ03-01${n}`, "F", `Napoleon and Paris filler ${n}?`)),
    ];
    const ids = (await lookup(rows, "zeus hera napoleon paris")).cardRulings.map((r) => r.cardId);
    expect(ids).toEqual(["ZZ03-001"]);
  });

  it("returns no card rulings for a question about the event rules (#603)", async () => {
    const rows = [entry("ZZ04-001", "A", "Can the match time run out during a battle?"), entry("ZZ04-002", "B", "Does time run out for a match?")];
    expect((await lookup(rows, "what happens if time runs out in a match")).cardRulings).toEqual([]);
    expect((await lookup(rows, "can a battle happen at the same time")).cardRulings.length).toBeGreaterThan(0);
  });

  it("names a ruling's card from the catalog and falls back to the FAQ label without one (#603)", async () => {
    const withCatalog = await lookup(entries, "attacked character draw");
    const row = withCatalog.cardRulings.find((r) => r.cardId === realIds.plain)!;
    expect(row.cardName).toBe(catalog.cards.get(realIds.plain)!.name);
    expect(row.cardName).not.toBe("Printed Label");
    const without = await lookup(entries, "attacked character draw", undefined, false);
    expect(without.cardRulings.find((r) => r.cardId === realIds.plain)!.cardName).toBe("Printed Label");
  });
});

describe("tournament rules manual", () => {
  // Made-up manual text in the PDF's shape: contents with dotted leaders, chapters, numbered list items and page numbers.
  const lines = [
    "Last Updated: January 2, 2030",
    "Sample Event Rules",
    "Table of Contents",
    "1.0 Players ........................ 3",
    "1.1 Entry ........................... 3",
    "1.0 Players",
    "Everyone who enters is a player.",
    "1.1 Entry",
    "Register before the round starts. Steps:",
    "1. Make an account",
    "2. Sign up using the account",
    "2.5 inches of space must stay between mats.",
    "3",
    "1.2 Sleeves",
    "Sleeves must be opaque and match.",
    "2.0 Rounds",
    "2.1 Time Limit",
    "Each round lasts 45 minutes. When time is called, finish the turn,",
    "then play three extra turns.",
    "2.1.1 Extra Turns",
    "Extra turns last five minutes.",
    "2.1.2 Draws",
    "Nobody wins a drawn match.",
    "2.1 Time Limit Again",
    "2.2 Penalties",
    "A warning is the lightest penalty for slow play.",
    "2.3 Deck Checks",
    "A judge may check a player with 0 cards in your deck at any time.",
  ];
  const doc = parseTournamentRules(lines);

  it("splits numbered headings, skipping contents lines and numbered list items (#603)", () => {
    expect(doc.sections.map((s) => s.id)).toEqual(["1.0", "1.1", "1.2", "2.0", "2.1", "2.1.1", "2.1.2", "2.2", "2.3"]);
    expect(doc.sections.find((s) => s.id === "1.1")).toEqual({
      id: "1.1",
      title: "Entry",
      text: "Register before the round starts. Steps: 1. Make an account 2. Sign up using the account 2.5 inches of space must stay between mats.",
    });
    expect(doc.updated).toBe("January 2, 2030");
    // The contents' "1.0 Players" must not open a section ahead of the real one, and a repeated number stays in its section.
    expect(doc.sections.find((s) => s.id === "1.0")!.text).toBe("Everyone who enters is a player.");
    expect(doc.sections.find((s) => s.id === "2.1.2")!.text).toContain("2.1 Time Limit Again");
  });

  it("ranks the section that holds the rare words first (#603)", () => {
    expect(searchTournamentRules(doc, "what happens when time is called", 2).map((s) => s.id)[0]).toBe("2.1");
    expect(searchTournamentRules(doc, "what penalty for slow play warning", 2).map((s) => s.id)[0]).toBe("2.2");
  });

  it("reads 'time runs out' as the round timer, not as deck-out (#603)", () => {
    expect(searchTournamentRules(doc, "time runs out", 1).map((s) => s.id)).toEqual(["2.1"]);
  });

  it("shows the part of a long section that matches the question (#603)", () => {
    const text = `${"Opening words about nothing. ".repeat(30)}Penalty for slow play is a warning. ${"Closing words about nothing. ".repeat(30)}`;
    const shown = excerpt(text, "slow play warning", 300);
    expect(shown.length).toBeLessThanOrEqual(305);
    expect(shown).toContain("slow play");
    expect(excerpt("short", "anything", 300)).toBe("short");
  });

  it("treats event questions as tournament questions and game questions as not (#603)", () => {
    for (const q of [
      "what happens if time runs out in a match",
      "do I win if game 3 goes to time",
      "how many extra turns do we play",
      "can the judge give me a game loss",
      "are sleeves with logos allowed",
      "how does swiss pairing work",
      "do I need to register a deck list",
    ]) expect(looksLikeTournamentQuestion(q), q).toBe(true);
    for (const q of [
      "can I activate blocker when the attacked character is rested",
      "each time a character is played, can I use its effect",
      "how does an event card with trigger resolve",
      "what happens when my deck is out of cards",
    ]) expect(looksLikeTournamentQuestion(q), q).toBe(false);
  });

  class ManualLib extends FixedLibrary {
    constructor(private readonly manual: Promise<TournamentDoc>) {
      super(fixedList, { entries: [], general: [], files: 1, failed: [] });
    }
    override rules(): ReturnType<OfficialLibrary["rules"]> {
      return Promise.reject(new Error("no rules"));
    }
    override tournamentRules() {
      return this.manual;
    }
  }

  it("adds manual sections, with a note that they are event rules, for a tournament question only (#603)", async () => {
    const lib = new ManualLib(Promise.resolve(doc));
    const event = await rulesLookup(lib, { query: "what happens when time is called in a round" });
    expect(event.tournamentRules.map((s) => s.id)).toContain("2.1");
    expect(event.notes.join(" ")).toMatch(/not rules of the game/);
    const game = await rulesLookup(lib, { query: "can the attacked character block while rested" });
    expect(game.tournamentRules).toEqual([]);
    expect(game.notes.join(" ")).not.toMatch(/Tournament Rules Manual/);
  });

  it("caps each manual section's text at about 2000 characters (#603)", async () => {
    const long: TournamentDoc = { title: "t", updated: null, sections: [{ id: "9.1", title: "Round Timer", text: "Time is called for the round. ".repeat(100) }] };
    const out = await rulesLookup(new ManualLib(Promise.resolve(long)), { query: "when is time called in a round" });
    expect(out.tournamentRules).toHaveLength(1);
    expect(out.tournamentRules[0]!.text.length).toBeLessThanOrEqual(2010);
    expect(out.tournamentRules[0]!.text.length).toBeGreaterThan(1900);
  });

  it("still answers when the manual can't be read, and says so (#603)", async () => {
    const lib = new ManualLib(Promise.reject(new Error("offline")));
    const out = await rulesLookup(lib, { query: "what happens when time is called in a round" });
    expect(out.tournamentRules).toEqual([]);
    expect(out.notes.join(" ")).toMatch(/Couldn't read the official tournament rules manual/);
    expect(Array.isArray(out.generalQa)).toBe(true);
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
