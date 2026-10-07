import { describe, expect, it } from "vitest";
import { buildSources, kindLabel, parseSource, placeAt, placeMarkers, placePopover, playbookStatus, safeLink, splitMarks, statsDetail, type PlacedCitation } from "./citations";

const cite = (at: number, source: string, cited_text = "q", title = "T"): PlacedCitation => ({ at, source, title, cited_text });

describe("source ids and their badges (#390)", () => {
  it("reads the kind, id and part of every source the analyst names (#390)", () => {
    expect(parseSource("card:OP01-006")).toMatchObject({ kind: "card", id: "OP01-006" });
    expect(parseSource("rule:6-5-3")).toMatchObject({ kind: "rule", id: "6-5-3" });
    expect(parseSource("ruling:OP14-020#2")).toMatchObject({ kind: "ruling", id: "OP14-020", part: "2" });
    expect(parseSource("stats:OP01-001~OP02-001")).toMatchObject({ kind: "stats", id: "OP01-001", opponent: "OP02-001" });
    expect(parseSource("stats:OP01-001#OP01-016")).toMatchObject({ kind: "stats", id: "OP01-001", part: "OP01-016" });
    expect(parseSource("playbook:OP13-004~OP02-001")).toMatchObject({ kind: "playbook", id: "OP13-004", opponent: "OP02-001" });
    expect(parseSource("match:abc#t3")).toMatchObject({ kind: "match", id: "abc", turn: 3 });
    expect(parseSource("game:g_9#t12")).toMatchObject({ kind: "game", id: "g_9", turn: 12 });
    expect(parseSource("match:abc").turn).toBeUndefined();
    expect(parseSource("https://evil.example/x")).toMatchObject({ kind: "other", id: "https://evil.example/x" });
    expect(parseSource("javascript:alert(1)").kind).toBe("other");
  });

  it("labels each kind of source the way the Sources list shows it (#390)", () => {
    const label = (s: string) => kindLabel(parseSource(s));
    expect(label("ruling:OP14-020#2")).toBe("Official ruling");
    expect(label("rule:6-5-3")).toBe("Rules §6-5-3");
    expect(label("card:OP01-006")).toBe("Card");
    expect(label("stats:OP01-001")).toBe("Win rate");
    expect(label("playbook:OP13-004")).toBe("Playbook");
    expect(label("match:abc#t4")).toBe("Your match turn 4");
    expect(label("game:g_1#t2")).toBe("Archive game turn 2");
    expect(label("game:g_1")).toBe("Archive game");
    expect(label("deck:0a1b2c3d")).toBe("Deck check");
    expect(label("odds:d50h8x1f")).toBe("Odds");
  });

  it("parses sim: sources and labels them Goldfish sim (#402)", () => {
    expect(parseSource("sim:1a2b3c4d#curve")).toMatchObject({ kind: "sim", id: "1a2b3c4d", part: "curve" });
    expect(kindLabel(parseSource("sim:1a2b3c4d"))).toBe("Goldfish sim");
  });

  it("reads whether a playbook note was reviewed, and its set, from the title (#390)", () => {
    expect(playbookStatus("Sabo playbook (Draft, OP17, stale)")).toEqual({ status: "Draft", set: "OP17", stale: true });
    expect(playbookStatus("Sabo vs Whitebeard playbook (Reviewed, OP17)")).toEqual({ status: "Reviewed", set: "OP17", stale: false });
    expect(playbookStatus("Sabo playbook")).toBeNull();
  });

  it("reads games and the interval out of a win record, and flags too few games (#390)", () => {
    expect(statsDetail("Going first: 60.0% win rate, 6 wins in 10 games (95% interval 30.0% to 70.0%).")).toEqual({ games: 10, interval: [30, 70], tooFew: false });
    expect(statsDetail("Overall: too few games (3) for a win rate.")).toEqual({ games: 3, tooFew: true });
    expect(statsDetail("Play share: 25.0% of recorded games.")).toBeNull();
  });
});

describe("citation placement and the Sources list (#390)", () => {
  it("puts citations that arrive with the stream at the end of the text received so far (#390)", () => {
    expect(placeAt([{ source: "card:A", title: "A", cited_text: "q" }, { source: "rule:1", title: "R", cited_text: "r" }], 42)).toEqual([
      { at: 42, source: "card:A", title: "A", cited_text: "q" },
      { at: 42, source: "rule:1", title: "R", cited_text: "r" },
    ]);
  });

  it("links a source only to a path in the app or an http(s) address (#390)", () => {
    expect(safeLink("/history/m1#turn-3")).toBe("/history/m1#turn-3");
    expect(safeLink("https://optcgduel.app/history/m1")).toBe("https://optcgduel.app/history/m1");
    expect(safeLink("javascript:alert(1)")).toBeNull();
    expect(safeLink("//evil.example/x")).toBeNull();
    expect(safeLink("data:text/html,x")).toBeNull();
    expect(safeLink("")).toBeNull();
    expect(safeLink(null)).toBeNull();
  });

  it("numbers sources in order of first citation and counts a repeated source once (#390)", () => {
    const { entries, marks } = buildSources([
      cite(40, "rule:6-5-3", "Blocker rule"),
      cite(10, "card:OP01-001", "cost 3", "Zoro"),
      cite(25, "card:OP01-001", "power 5000", "Zoro"),
      cite(25, "card:OP01-001", "power 5000", "Zoro"),
    ]);
    expect(entries.map((e) => [e.n, e.source])).toEqual([
      [1, "card:OP01-001"],
      [2, "rule:6-5-3"],
    ]);
    expect(entries[0]!.quotes).toEqual(["cost 3", "power 5000"]);
    expect(entries[0]).toMatchObject({ title: "Zoro", parsed: { kind: "card" } });
    expect(marks.map((m) => [m.at, m.n])).toEqual([[10, 1], [25, 1], [25, 1], [40, 2]]);
  });

  it("puts each marker right after the cited text, in order, and keeps text between them (#390)", () => {
    const marks = buildSources([cite(10, "card:A"), cite(16, "rule:1-1")]).marks;
    const text = placeMarkers("Zoro hits. Done.", marks);
    expect(splitMarks(text)).toEqual(["Zoro hits.", 0, " Done.", 1]);
    expect(splitMarks(placeMarkers("abc", []))).toEqual(["abc"]);
    // Marks given out of order still land in text order.
    const c = (at: number) => ({ at, n: 1, citation: cite(at, "card:A") });
    expect(splitMarks(placeMarkers("Zoro hits. Done.", [c(16), c(10)]))).toEqual(["Zoro hits.", 1, " Done.", 0]);
  });

  it("moves a marker back off trailing blank lines, onto the last visible character (#390)", () => {
    const marks = buildSources([cite(8, "card:A")]).marks;
    expect(splitMarks(placeMarkers("Hello.\n\nNext", marks))).toEqual(["Hello.", 0, "\n\nNext"]);
  });

  it("never splits an emoji and clamps an offset past the end of the text (#390)", () => {
    const text = "Go \u{1F5E1} now";
    const inside = buildSources([cite(4, "card:A")]).marks; // between the surrogate halves
    expect(splitMarks(placeMarkers(text, inside))).toEqual(["Go \u{1F5E1}", 0, " now"]);
    const past = buildSources([cite(999, "card:A")]).marks;
    expect(splitMarks(placeMarkers("end", past))).toEqual(["end", 0]);
    expect(splitMarks(placeMarkers("end \n", past))).toEqual(["end", 0, " \n"]);
  });

  it("removes marker characters from the answer's own text so it can't forge a marker (#390)", () => {
    expect(splitMarks(placeMarkers("Fake \uE0009\uE001 marker", []))).toEqual(["Fake 9 marker"]);
    const marks = buildSources([cite(16, "card:A")]).marks;
    expect(splitMarks(placeMarkers("Fake \uE0009\uE001 marker. After.", marks))).toEqual(["Fake 9 marker.", 0, " After."]);
  });

  it("keeps a popover on screen: below its marker when it fits, above when it doesn't, inside the sides (#390)", () => {
    const vp = { w: 375, h: 700 };
    const size = { w: 320, h: 200 };
    const below = placePopover({ left: 100, top: 100, width: 20, height: 18 }, size, vp);
    expect(below).toEqual({ left: 8, top: 124, above: false });
    const above = placePopover({ left: 330, top: 600, width: 20, height: 18 }, size, vp);
    expect(above.above).toBe(true);
    expect(above.top).toBe(600 - 6 - 200);
    expect(above.left).toBe(375 - 320 - 8);
    // Too tall for either side: pinned inside the screen.
    const tall = placePopover({ left: 10, top: 300, width: 20, height: 18 }, { w: 300, h: 680 }, vp);
    expect(tall.top).toBe(12);
    // Wider than the screen: shrinks to fit.
    expect(placePopover({ left: 10, top: 10, width: 20, height: 18 }, { w: 500, h: 100 }, vp).left).toBe(8);
  });
});
