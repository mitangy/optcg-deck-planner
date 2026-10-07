import { describe, expect, it } from "vitest";
import { loadCatalog } from "./catalog";
import { buildTools } from "./server";
import { adaptToolResult, deckSourceId, gameResults, groupTurns, recordSentence, searchResult, splitFacts, type SearchResultBlock, type ToolContent } from "./sources";

const catalog = loadCatalog();

const results = (blocks: ToolContent[] | null) => (blocks ?? []).filter((b): b is SearchResultBlock => b.type === "search_result");
const allSources = (blocks: ToolContent[] | null) => results(blocks).map((b) => b.source);
/** The sources a tool's facts got, leaving out the note: source its loose notes are folded into (#394). */
const sources = (blocks: ToolContent[] | null) => allSources(blocks).filter((s) => !s.startsWith("note:"));
const texts = (b: SearchResultBlock) => b.content.map((c) => c.text);
const adapt = (tool: string, value: unknown) => adaptToolResult(tool, JSON.stringify(value));

const GAME = {
  matchId: "m1",
  yourLeader: "Roronoa Zoro",
  opponentLeader: "Rob Lucci",
  wentFirst: true,
  yourOpeningHand: ["Nami", null],
  result: { won: false, reason: "life" },
  finalState: { turn: 3, yourLife: 0, opponentLife: 2, yourBoard: ["Nami"], opponentBoard: [] },
  log: [
    "--- Turn 1 (your turn) ---",
    "You play Nami",
    "--- Turn 2 (opponent's turn) ---",
    "Opponent attacks your Leader",
    "Your Life card is taken",
    "--- Turn 3 (your turn) ---",
    "You pass",
  ],
  notes: ["Log lines come from the duel engine."],
};

describe("tool answers as citable sources (#390)", () => {
  it("gives each card its own card: source with the printed facts as separate blocks (#390)", async () => {
    const tool = buildTools(catalog).find((t) => t.name === "get_cards")!;
    const out = await tool.run({ ids: ["OP01-001", "OP01-016"] });
    const blocks = adaptToolResult("get_cards", out.content[0]!.text);
    expect(sources(blocks)).toEqual(["card:OP01-001", "card:OP01-016"]);
    const zoro = results(blocks)[0]!;
    expect(zoro.title).toBe(`${catalog.cards.get("OP01-001")!.name} (OP01-001)`);
    expect(texts(zoro)[0]).toMatch(/^OP01-001 .*: leader/);
    expect(zoro.content.length).toBeGreaterThan(1);
  });

  it("keeps the plain text for a tool with no adapter, an error-shaped answer or text that isn't JSON (#390)", () => {
    expect(adaptToolResult("export_deck", '{"list":"1xOP01-001"}')).toBeNull();
    expect(adaptToolResult("get_cards", "Couldn't read the deck")).toBeNull();
    expect(adaptToolResult("get_cards", '{"cards":[],"missing":["X"]}')).toBeNull();
  });

  it("enables citations on every search result and never sends an empty text block (#390)", () => {
    const all: ToolContent[] = [
      ...(adapt("matchup_stats", { leader: "OP01-001", opponent: "OP02-001", source: "optcgduel.app duels", days: 90, ranked_only: false, games: 12, wins: 6, win_rate: 0.5, interval: [0.25, 0.75], too_few_games: false }) ?? []),
      ...(adapt("draw_odds", { deckSize: 50, hits: 8, atLeast: 1, goingFirst: true, mulligan: false, byTurn: [{ turn: 1, percent: 60.5 }] }) ?? []),
      ...gameResults("match", "m1", GAME),
      ...(adapt("rules_lookup", { sections: [{ id: "6-5-3", path: "6 > 6-5", text: "Blocker rule" }], generalQa: [], notes: [] }) ?? []),
    ];
    const found = results(all);
    expect(found.length).toBeGreaterThan(5);
    for (const r of found) {
      expect(r.citations).toEqual({ enabled: true });
      expect(r.content.length).toBeGreaterThan(0);
      for (const c of r.content) expect(c.text.trim()).not.toBe("");
    }
  });

  it("drops blank facts and gives no source at all when nothing is left to quote (#390)", () => {
    expect(searchResult("card:X", "X", ["a", "  ", "", null, undefined, false, " b "])!.content.map((c) => c.text)).toEqual(["a", "b"]);
    expect(searchResult("card:X", "X", ["  ", null])).toBeNull();
  });

  it("cites rules by section number and general Q&A under ruling:general (#390)", () => {
    const blocks = adapt("rules_lookup", {
      source: { title: "Comprehensive Rules", version: "1.2", updated: "2026-01-01" },
      sections: [{ id: "6-5-3", path: "6 > 6-5", text: "Blocker activates when attacked.", children: [{ id: "6-5-3-1", text: "Rest this card." }] }],
      generalQa: [{ category: "Battle", question: "Can I block twice?", answer: "No. Only once per battle. Choose one." }],
      notes: ["Cite rules by section number."],
    });
    const [rule, qa] = results(blocks);
    expect(rule!.source).toBe("rule:6-5-3");
    expect(texts(rule!)).toEqual(["6-5-3 Blocker activates when attacked.", "6-5-3-1 Rest this card."]);
    expect(qa!.source).toMatch(/^ruling:general#[0-9a-f]{8}$/);
    expect(texts(qa!)).toEqual(["Q: Can I block twice?", "A: No. Only once per battle. Choose one."]);
    expect(blocks!.at(-1)).toMatchObject({ type: "search_result", source: "note:rules_lookup" });
  });

  it("numbers a card's official rulings ruling:<card>#<n> and keeps errata and ban status as their own sources (#390)", () => {
    const blocks = adapt("card_rulings", {
      cards: [
        {
          id: "OP14-020",
          name: "Zoro",
          known: true,
          banStatus: "legal",
          errata: [{ date: "2026-02-01", before: "old", after: "new" }],
          rulings: [
            { question: "Q one?", answer: "A one." },
            { question: "Q two?", answer: "A two." },
          ],
          moreRulings: 0,
          mentionedIn: [{ cardId: "OP01-001", cardName: "Other", question: "Q three?", answer: "A three." }],
        },
      ],
      notes: [],
    });
    expect(sources(blocks)).toEqual(["ruling:OP14-020#ban", "ruling:OP14-020#e1", "ruling:OP14-020#1", "ruling:OP14-020#2", "ruling:OP14-020#m1"]);
    expect(texts(results(blocks)[3]!)).toEqual(["Q: Q two?", "A: A two."]);
  });

  it("writes each win record as one sentence with its games and interval, and says when there are too few (#390)", () => {
    expect(recordSentence("Overall", { games: 120, wins: 65, win_rate: 0.542, interval: [0.451, 0.628], too_few_games: false })).toBe(
      "Overall: 54.2% win rate, 65 wins in 120 games (95% interval 45.1% to 62.8%).",
    );
    expect(recordSentence("Going first", { games: 3, wins: null, win_rate: null, interval: null, too_few_games: true })).toBe("Going first: too few games (3) for a win rate.");
    expect(recordSentence("x", null)).toBeNull();
  });

  it("puts a matchup under stats:<leader>~<opponent>, a leader's overall record under stats:<leader> and card rates under stats:<leader>#<card> (#390)", () => {
    const rec = (games: number, wins: number) => ({ games, wins, win_rate: wins / games, interval: [0.3, 0.7], too_few_games: false });
    const split = { ...rec(20, 11), going_first: rec(10, 6), going_second: rec(10, 5), average_turns: 7.5 };
    const meta = { source: "optcgduel.app duels", days: 90, ranked_only: false };
    const matchup = adapt("matchup_stats", { ...meta, leader: "OP01-001", leader_name: "Zoro", opponent: "OP02-001", opponent_name: "Whitebeard", ...split });
    expect(sources(matchup)).toEqual(["stats:OP01-001~OP02-001"]);
    expect(texts(results(matchup)[0]!)).toContain("Going first: 60.0% win rate, 6 wins in 10 games (95% interval 30.0% to 70.0%).");
    expect(texts(results(matchup)[0]!).at(-1)).toMatch(/optcgduel\.app duels, last 90 days.*not tournament/);

    const leader = adapt("matchup_stats", {
      ...meta,
      leader: "OP01-001",
      overall: split,
      opponents: [{ opponent: "OP02-001", opponent_name: "Whitebeard", ...split }],
      cards: [{ id: "OP01-016", id_name: "Nami", with: rec(8, 5), without: rec(12, 6) }],
    });
    expect(sources(leader)).toEqual(["stats:OP01-001", "stats:OP01-001~OP02-001", "stats:OP01-001#OP01-016"]);

    const overall = adapt("matchup_stats", { ...meta, total_games: 40, leaders: [{ leader: "OP01-001", leader_name: "Zoro", share: 0.25, ...split }] });
    expect(sources(overall)).toEqual(["stats:OP01-001"]);
    expect(texts(results(overall)[0]!)[0]).toBe("Play share: 25.0% of recorded games.");
  });

  it("puts tournament records under tourney:, apart from the stats: sources of optcgduel.app games, in the record sentence format (#397)", () => {
    const rec = (games: number, wins: number, ties = 0) => ({ games, wins, win_rate: wins / games, interval: [0.3, 0.7], too_few_games: false, ties });
    const meta = { source: "Limitless TCG tournaments", days: 30, min_players: 8 };
    const leader = adapt("tournament_stats", {
      ...meta,
      leader: "OP01-001",
      leader_name: "Zoro",
      events: [{ id: "e1", name: "Cup", date: "2026-10-01", players: 32 }],
      meta: { decks: 7, total_decks: 28, share: 0.25 },
      overall: rec(40, 22, 2),
      mirror_games: 3,
      opponents: [
        { opponent: "OP02-001", opponent_name: "Whitebeard", ...rec(10, 6) },
        { opponent: "OP03-001", games: 2, wins: null, win_rate: null, interval: null, too_few_games: true, ties: 0 },
      ],
      decklists: 6,
      too_few_decks: false,
      cards: [{ id: "OP01-016", id_name: "Nami", decks: 5, rate: 0.833, average_copies: 3.8 }],
      top_placings: [],
    });
    expect(sources(leader)).toEqual(["tourney:OP01-001", "tourney:OP01-001~OP02-001", "tourney:OP01-001~OP03-001", "tourney:OP01-001#OP01-016"]);
    const overall = texts(results(leader)[0]!);
    expect(overall).toContain("Meta share: 25.0% of tournament decks (7 of 28 decks in 1 events).");
    expect(overall).toContain("Tournament record against other leaders: 55.0% win rate, 22 wins in 40 games (95% interval 30.0% to 70.0%).");
    expect(overall).toContain("Ties not counted as games: 2.");
    expect(overall).toContain("Mirror matches: 3 games, left out of the record.");
    expect(overall.at(-1)).toMatch(/Limitless TCG tournament results.*last 30 days.*not games from optcgduel\.app/);
    expect(texts(results(leader)[1]!)[0]).toBe("Tournament record: 60.0% win rate, 6 wins in 10 games (95% interval 30.0% to 70.0%).");
    expect(texts(results(leader)[2]!)[0]).toBe("Tournament record: too few games (2) for a win rate.");
    expect(texts(results(leader)[3]!)[0]).toBe("Included in 83.3% of 6 Limitless decklists (5 decks), average 3.8 copies.");

    const few = adapt("tournament_stats", { ...meta, leader: "OP01-001", events: [], meta: { decks: 3, total_decks: 9, share: 0.3 }, overall: rec(10, 5), opponents: [], decklists: 3, too_few_decks: true, cards: [{ id: "OP01-016", decks: 2, rate: 0.667, average_copies: 4 }], top_placings: [] });
    expect(texts(results(few)[1]!)).toContain("Only 3 decklists, too few to call this a trend.");
    expect(texts(results(leader)[3]!).join(" ")).not.toContain("too few");

    const matchup = adapt("tournament_stats", { ...meta, leader: "OP01-001", opponent: "OP02-001", ...rec(10, 6) });
    expect(sources(matchup)).toEqual(["tourney:OP01-001~OP02-001"]);
    const mirror = adapt("tournament_stats", { ...meta, leader: "OP01-001", opponent: "OP01-001", mirror: true, games: 3 });
    expect(texts(results(mirror)[0]!)[0]).toMatch(/^Mirror match: 3 tournament games.*no win rate/);
  });

  it("ranks the meta overview with its minimum sample and gives each leader a meta share (#397)", () => {
    const rec = (games: number, wins: number) => ({ games, wins, win_rate: wins / games, interval: [0.4, 0.8], too_few_games: false, ties: 0 });
    const blocks = adapt("tournament_stats", {
      source: "Limitless TCG tournaments",
      days: 30,
      min_players: 8,
      events: [{ id: "e1" }, { id: "e2" }],
      total_decks: 100,
      total_games: 300,
      leaders: [{ leader: "OP01-001", leader_name: "Zoro", decks: 20, share: 0.2, ...rec(60, 36) }],
      top_win_rate: [{ leader: "OP01-001", leader_name: "Zoro", ...rec(60, 36) }],
      top_win_rate_min_games: 20,
    });
    expect(sources(blocks)).toEqual(["tourney:meta", "tourney:OP01-001"]);
    expect(texts(results(blocks)[0]!)[0]).toBe("100 decks and 300 finished games from 2 events.");
    expect(texts(results(blocks)[0]!)[1]).toBe("Top win rate 1, Zoro (OP01-001) (at least 20 games): 60.0% win rate, 36 wins in 60 games (95% interval 40.0% to 80.0%).");
    expect(texts(results(blocks)[1]!)[0]).toBe("Meta share: 20.0% of tournament decks (20 decks).");
  });

  it("makes an event: source of each event a leader placed at, with the finish, record and decklist (#397)", () => {
    const blocks = adapt("tournament_stats", {
      source: "Limitless TCG tournaments",
      days: 30,
      min_players: 8,
      leader: "OP01-001",
      leader_name: "Zoro",
      events: [],
      meta: { decks: 1, total_decks: 2, share: 0.5 },
      overall: { games: 0, wins: null, win_rate: null, interval: null, too_few_games: true, ties: 0 },
      mirror_games: 0,
      opponents: [],
      cards: [],
      top_placings: [
        { event_id: "6abc", event: "ChinoizeCup #119", date: "2026-10-06", players: 64, placing: 1, record: { wins: 6, losses: 0, ties: 0 }, decklist: { "OP01-006": 3, "OP01-016": 4 } },
        { event_id: "6abc", event: "ChinoizeCup #119", date: "2026-10-06", players: 64, placing: 12, record: { wins: 4, losses: 1, ties: 1 }, decklist: {} },
      ],
    });
    expect(sources(blocks)).toEqual(["tourney:OP01-001", "event:6abc"]);
    const event = results(blocks)[1]!;
    expect(event.title).toBe("ChinoizeCup #119, 2026-10-06");
    expect(texts(event)).toEqual([
      "ChinoizeCup #119: 2026-10-06, 64 players.",
      "Zoro (OP01-001) finished 1st (6-0).",
      "Decklist: 4xOP01-016, 3xOP01-006.",
      "Zoro (OP01-001) finished 12th (4-1-1).",
      expect.stringMatching(/^Source: Limitless TCG/),
    ]);
  });

  it("offers tournament_stats beside matchup_stats only when the planner API is configured, and asks for tournament data (#397)", async () => {
    expect(buildTools(catalog).map((t) => t.name)).not.toContain("tournament_stats");
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ source: "Limitless TCG tournaments", days: 30, min_players: 8, leader: "OP01-001", opponent: "OP02-001", games: 12, wins: 6, win_rate: 0.5, interval: [0.25, 0.75], too_few_games: false }), { status: 200 });
    }) as unknown as typeof fetch;
    const api = { baseUrl: "https://api.test", serviceSecret: "svc", fetchImpl };
    const tools = buildTools(catalog, undefined, undefined, { stats: api });
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(["matchup_stats", "tournament_stats"]));
    const out = await tools.find((t) => t.name === "tournament_stats")!.run({ leader: "OP01-001", opponent: "OP02-001", minPlayers: 16 });
    expect(urls).toEqual(["https://api.test/analyst/tournaments/stats?leader=OP01-001&opponent=OP02-001&min_players=16"]);
    expect(allSources(adaptToolResult("tournament_stats", out.content[0]!.text))).toEqual(["tourney:OP01-001~OP02-001"]);
  });

  it("titles a playbook note with whether a player reviewed it and the set it was written for (#390)", () => {
    const meta = (status: string, stale: boolean) => ({ leader: "OP13-004", name: "Sabo", format: "OP17", status, stale });
    const leader = adapt("playbook", { currentFormat: "OP18", leader: meta("draft", true), sections: { "Game plan": "Go wide.\nPressure every turn.", Mulligan: "- Keep Saul." }, notes: [] });
    const note = results(leader)[0]!;
    expect(note.source).toBe("playbook:OP13-004");
    expect(note.title).toBe("Sabo playbook (Draft, OP17, stale)");
    expect(texts(note)).toEqual(["Game plan: Go wide.", "Game plan: Pressure every turn.", "Mulligan: Keep Saul."]);

    const vs = adapt("playbook", {
      currentFormat: "OP17",
      leader: meta("reviewed", false),
      opponent: { ...meta("draft", false), leader: "OP02-001", name: "Whitebeard" },
      fromLeaderSide: { heading: "vs OP02-001", text: "Race them." },
      fromOpponentSide: { heading: "vs OP13-004", text: "Trade early." },
      leaderGamePlan: "Go wide.",
      opponentGamePlan: null,
      notes: [],
    });
    expect(sources(vs)).toEqual(["playbook:OP13-004~OP02-001", "playbook:OP02-001~OP13-004", "playbook:OP13-004"]);
    expect(results(vs)[0]!.title).toBe("Sabo vs Whitebeard playbook (Reviewed, OP17)");
    expect(results(vs)[1]!.title).toBe("Whitebeard vs Sabo playbook (Draft, OP17)");
  });

  it("makes the playbook's general principles a playbook:general source and keeps the leader index as a note (#390)", () => {
    const blocks = adapt("playbook", { currentFormat: "OP17", notes: [{ leader: "OP13-004", name: "Sabo", status: "draft", format: "OP17", stale: false }], general: { Mulligan: "Keep a 2-drop." } });
    expect(allSources(blocks)).toEqual(["playbook:general", "note:playbook"]);
    expect(texts(results(blocks).at(-1)!).join(" ")).toContain("OP13-004 Sabo (draft, OP17)");
  });

  it("sends a tool result made only of search results, with its notes as one note: source, since the API refuses a mix (#394)", () => {
    const blocks = adapt("playbook", { currentFormat: "OP17", notes: [{ leader: "OP13-004", name: "Sabo", status: "draft", format: "OP17", stale: false }], general: { Mulligan: "Keep a 2-drop." } });
    expect(blocks!.every((b) => b.type === "search_result")).toBe(true);
    const hits = adapt("search_matches", { total: 40, offset: 0, window_days: 30, games: Array.from({ length: 30 }, (_, i) => ({ game_id: `g_${i}`, turns: 5, A: { leader: "OP01-001", won: true }, B: { leader: "OP02-001", won: false } })) });
    expect(hits!.every((b) => b.type === "search_result")).toBe(true);
    expect(allSources(hits).filter((s) => s === "note:search_matches")).toHaveLength(1);
  });

  it("gives a saved lesson its own lesson: source (#390)", () => {
    const blocks = adapt("my_lessons", { lessons: [{ id: 7, status: "approved", text: "Keep Kuzan back.", leader_id: "OP01-001", opponent_id: null, cards: [], match_ids: ["m1"] }] });
    expect(sources(blocks)).toEqual(["lesson:7"]);
    expect(adapt("my_lessons", { lessons: [] })).toBeNull();
  });

  it("cuts a game into one source per turn, match:<id>#t<n> for the player's own and game:<id>#t<n> for the archive (#390)", () => {
    expect(groupTurns(GAME.log).map((t) => [t.turn, t.lines.length])).toEqual([[1, 1], [2, 2], [3, 1]]);
    const mine = adapt("review_match", GAME);
    expect(sources(mine)).toEqual(["match:m1", "match:m1#t1", "match:m1#t2", "match:m1#t3"]);
    expect(results(mine)[2]!.title).toBe("Roronoa Zoro vs Rob Lucci, turn 2 (opponent's turn)");
    expect(texts(results(mine)[2]!)).toEqual(["Opponent attacks your Leader", "Your Life card is taken"]);
    expect(texts(results(mine)[0]!).join(" ")).toContain("Result: you lost (life).");

    const archive = adapt("replay_match", {
      gameId: "g_9",
      date: "2026-09-01",
      ranked: true,
      ratingBands: { A: "gold", B: null },
      wentFirst: "A",
      leaders: { A: "Zoro", B: "Lucci" },
      openingHands: { A: ["Nami"], B: ["Usopp"] },
      result: { winner: "B", reason: "life" },
      finalState: { turn: 2, A: { life: 0, board: [] }, B: { life: 3, board: [] } },
      log: ["--- Turn 1 (Player A's turn) ---", "Player A plays Nami"],
      notes: [],
    });
    expect(sources(archive)).toEqual(["game:g_9", "game:g_9#t1"]);
    expect(results(archive)[1]!.title).toBe("Zoro vs Lucci, turn 1 (Player A's turn)");
  });

  it("lists archive search hits as game:<id> sources with both sides (#390)", () => {
    const side = (leader: string, won: boolean) => ({ leader, leader_name: leader, won, went_first: won, rating_band: "gold" });
    const blocks = adapt("search_matches", { total: 1, offset: 0, window_days: 90, games: [{ game_id: "g_1", date: "2026-09-01", ranked: true, turns: 8, A: side("OP01-001", true), B: side("OP02-001", false) }] });
    expect(sources(blocks)).toEqual(["game:g_1"]);
    expect(texts(results(blocks)[0]!)[0]).toBe("Side A: OP01-001 (OP01-001), won, went first, rating gold.");
  });

  it("gives the same deck the same deck: source whatever order its cards come in, and another list another one (#390)", () => {
    const a = deckSourceId("OP01-001", [{ id: "OP01-016", copies: 4 }, { id: "OP01-017", copies: 2 }]);
    expect(deckSourceId("OP01-001", [{ id: "OP01-017", copies: 2 }, { id: "OP01-016", copies: 4 }])).toBe(a);
    expect(deckSourceId("OP01-001", [{ id: "OP01-016", copies: 3 }, { id: "OP01-017", copies: 2 }])).not.toBe(a);
    expect(deckSourceId("OP02-001", [{ id: "OP01-016", copies: 4 }, { id: "OP01-017", copies: 2 }])).not.toBe(a);
    expect(a).toMatch(/^deck:[0-9a-f]{8}$/);
  });

  it("states a deck check's legality, ban list problems and searcher odds as separate facts under its deck: source (#390)", () => {
    const deck = { name: "Zoro", leader: { id: "OP01-001", name: "Roronoa Zoro" }, mainDeckCount: 50, cards: [{ id: "OP01-016", copies: 4 }], warnings: [] };
    const blocks = adapt("analyze_deck", {
      deck,
      legal: false,
      hints: [{ tier: "rule", title: "Too many copies", detail: "Max 4." }],
      stats: { costCurve: [{ cost: 1, total: 4 }], counter: { none: 10, c1000: 20, c2000: 4, events: 3, average: 900 }, openingHand: { size: 5, expectedCounter: 1.2, expectedTriggers: 0.5 }, roles: [{ name: "draw", count: 8 }] },
      searchers: [{ name: "Nami", look: 5, hits: 7, chance: 61.2 }],
      banList: { checked: true, problems: [{ cards: ["OP01-016"], problem: "OP01-016 is banned." }], upcoming: [] },
      notImplemented: [],
      notes: [],
    });
    const check = results(blocks)[0]!;
    expect(check.source).toBe(deckSourceId("OP01-001", deck.cards));
    expect(texts(check)).toContain("Zoro: leader Roronoa Zoro (OP01-001), 50 main deck cards. Not legal.");
    expect(texts(check)).toContain("rule: Too many copies. Max 4.");
    expect(texts(check)).toContain("Ban list: OP01-016 is banned.");
    expect(texts(check)).toContain("Nami looks at 5: 61.2% to find a hit (7 left in the deck).");
  });

  it("makes draw odds one odds: source with a sentence per turn that says whether it's going first (#390)", () => {
    const base = { deckSize: 50, hits: 8, atLeast: 2, mulligan: true, byTurn: [{ turn: 1, percent: 40 }, { turn: 2, percent: 55.5 }], notes: ["Turn N means your own Nth turn."] };
    const first = adapt("draw_odds", { ...base, goingFirst: true });
    const second = adapt("draw_odds", { ...base, goingFirst: false });
    expect(sources(first)).toEqual(["odds:d50h8x2fm"]);
    expect(sources(second)).toEqual(["odds:d50h8x2sm"]);
    expect(texts(results(first)[0]!)).toContain("By turn 2: 55.5% to have seen at least 2 (going first).");
  });

  it("splits a long paragraph into sentences and a bullet list into its items (#390)", () => {
    expect(splitFacts("- one\n- two")).toEqual(["one", "two"]);
    const long = `${"Alpha beta gamma. ".repeat(14)}Last one.`;
    const parts = splitFacts(long);
    expect(parts.length).toBe(15);
    expect(parts.at(-1)).toBe("Last one.");
    expect(splitFacts("Short sentence. Another short one.")).toEqual(["Short sentence. Another short one."]);
  });
});
