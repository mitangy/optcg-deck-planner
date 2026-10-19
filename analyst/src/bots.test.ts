import { describe, expect, it } from "vitest";
import { botLabel, lineDescription, replayGame, searchAnyGames, simStats } from "./matches";
import { adaptToolResult, gameResults, type SearchResultBlock } from "./sources";
import { finishedGame } from "./testFixtures";

type Call = { url: string; headers: Record<string, string> };
function serve(answers: Record<string, unknown>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string> });
    const hit = Object.entries(answers).find(([prefix]) => new URL(url).pathname === prefix);
    return new Response(JSON.stringify(hit ? hit[1] : {}), { status: hit ? 200 : 404 });
  }) as unknown as typeof fetch;
  return { calls, api: { baseUrl: "https://api.test", serviceSecret: "svc", fetchImpl } };
}

const side = (leader: string, won: boolean | null) => ({ leader, won, went_first: true });
const botGame = { game_id: "b_1", levels: "hard/hard", turns: 9, date: "2026-10-19", A: side("OP01-001", true), B: side("OP05-060", false) };
const playerGame = { game_id: "g_1", ranked: true, turns: 7, date: "2026-10-18", A: { ...side("OP01-001", false), rating_band: "1000-1199" }, B: { ...side("OP05-060", true), rating_band: null } };

describe("bot games in search and replay (#635)", () => {
  it("labels a bot game with its levels, and falls back when they are unknown (#635)", () => {
    expect(botLabel("hard/hard")).toBe("bot game (Hard vs Hard self-play)");
    expect(botLabel("hard/normal")).toBe("bot game (Hard vs Normal self-play)");
    expect(botLabel("")).toBe("bot game (self-play)");
  });

  it("searches player games by default and bot games only when asked, passing the filters through (#635)", async () => {
    const s = serve({ "/analyst/corpus/games": { total: 1, offset: 0, window_days: 90, games: [playerGame] }, "/analyst/bot-games": { total: 1, offset: 0, games: [botGame] } });
    const players = await searchAnyGames(s.api, { leader: "op01-001" });
    expect(s.calls.map((c) => c.url)).toEqual(["https://api.test/analyst/corpus/games?leader=OP01-001"]);
    expect(players.games.map((g) => g.game_id)).toEqual(["g_1"]);

    const bots = await searchAnyGames(s.api, { source: "bots", leader: "op01-001", result: "won", levels: "hard/hard", rankedOnly: true, days: 30 });
    const url = new URL(s.calls[1]!.url);
    expect(url.pathname).toBe("/analyst/bot-games");
    expect(Object.fromEntries(url.searchParams)).toEqual({ leader: "OP01-001", result: "won", levels: "hard/hard" });
    expect(s.calls[1]!.headers["X-Analyst-Service"]).toBe("svc");
    expect(bots.games[0]).toMatchObject({ game_id: "b_1", kind: "bot game (Hard vs Hard self-play)", A: { leader_name: "Roronoa Zoro" } });
  });

  it("lists both kinds together, each labelled, with the counts kept apart (#635)", async () => {
    const s = serve({ "/analyst/corpus/games": { total: 40, offset: 0, window_days: 90, games: [playerGame] }, "/analyst/bot-games": { total: 3, offset: 0, games: [botGame] } });
    const both = (await searchAnyGames(s.api, { source: "both" })) as unknown as { total: number; player_games_total: number; bot_games_total: number; games: { game_id: string; kind: string }[] };
    expect(s.calls).toHaveLength(2);
    expect(both.games.map((g) => [g.game_id, g.kind])).toEqual([["g_1", "player game"], ["b_1", "bot game (Hard vs Hard self-play)"]]);
    expect([both.total, both.player_games_total, both.bot_games_total]).toEqual([43, 40, 3]);
  });

  it("replays a b_ game from the bot endpoint with every card named and says it is a bot game (#635)", async () => {
    const { replay } = finishedGame(3);
    const s = serve({ "/analyst/bot-games/b_9/replay": { game_id: "b_9", date: "2026-10-19", levels: "hard/hard", rules_version: "0.3.0", replay } });
    const out = (await replayGame(s.api, "b_9", { maxLines: 30 })) as { kind: string; notes: string[]; leaders: { A: string }; log: string[] };
    expect(s.calls.map((c) => new URL(c.url).pathname)).toEqual(["/analyst/bot-games/b_9/replay"]);
    expect(out.kind).toBe("bot game (Hard vs Hard self-play)");
    expect(out.notes[0]).toMatch(/not a game between people/);
    expect(out.log.length).toBeGreaterThan(5);
    const blocks = adaptToolResult("replay_match", JSON.stringify(out))!;
    expect(blocks.every((b) => b.type === "search_result")).toBe(true);
    expect((blocks[0] as SearchResultBlock).source).toBe("botgame:b_9");
    expect(blocks.some((b) => (b as SearchResultBlock).source === "botgame:b_9#t1")).toBe(true);
    expect((blocks[0] as SearchResultBlock).content.map((c) => c.text).join(" ")).toMatch(/simulated between bots/);
  });
});

describe("simulated stats (#635)", () => {
  const withLine = (line: string) => ({ line, with: { games: 30, wins: 21, win_rate: 0.7, interval: [0.52, 0.83], too_few_games: false }, without: { games: 50, wins: 25, win_rate: 0.5, interval: [0.37, 0.63], too_few_games: false } });

  it("reads the sim endpoint with the service secret, passes filters and describes every line with card names (#635)", async () => {
    const s = serve({
      "/analyst/stats/sim": { source: "bot self-play on optcgduel.app's engine", leader: "OP01-001", opponent: "OP05-060", games: 80, wins: 40, lines: [withLine("optional_accepted:OP01-016"), withLine("cheat_out:OP01-016 via OP01-001"), withLine("counter_event")] },
    });
    const out = (await simStats(s.api, { leader: "op01-001", opponent: "op05-060", levels: "hard/hard", days: 30, rulesVersion: "0.3.0" })) as { leader_name: string; lines: { description: string }[] };
    const url = new URL(s.calls[0]!.url);
    expect(Object.fromEntries(url.searchParams)).toEqual({ leader: "OP01-001", opponent: "OP05-060", levels: "hard/hard", days: "30", rules_version: "0.3.0" });
    expect(s.calls[0]!.headers).toEqual({ "X-Analyst-Service": "svc" });
    expect(out.leader_name).toBe("Roronoa Zoro");
    expect(out.lines.map((l) => l.description)).toEqual([
      'the optional ("You may") effect of Nami (OP01-016) accepted',
      "Nami (OP01-016) put into play by Roronoa Zoro (OP01-001) rather than played from hand",
      "at least one Counter Event played",
    ]);
  });

  it("refuses without the service secret (#635)", async () => {
    await expect(simStats({ baseUrl: "https://api.test", serviceSecret: "" }, {})).rejects.toThrow(/ANALYST_SERVICE_SECRET/);
  });

  it("describes lines in words (#635)", () => {
    expect(lineDescription("leader_activation")).toBe("the Leader's Activate: Main used at least once");
    expect(lineDescription("activation:OP01-016")).toBe("Activate: Main of Nami (OP01-016) used");
    expect(lineDescription("optional_declined:OP01-016")).toBe('the optional ("You may") effect of Nami (OP01-016) declined');
    expect(lineDescription("counter_event:OP01-016")).toBe("Counter Event Nami (OP01-016) played");
    expect(lineDescription("main_event:OP01-016")).toBe("[Main] Event Nami (OP01-016) played");
    expect(lineDescription("cheat_out:OP01-016 via rules")).toBe("Nami (OP01-016) put into play by the rules rather than played from hand");
  });

  it("cites simulated stats as botsim: sources apart from stats: and tourney:, with the games and interval in every record sentence (#635)", () => {
    const payload = {
      source: "bot self-play on optcgduel.app's engine",
      days: 90,
      levels: "hard/hard",
      leader: "OP01-001",
      leader_name: "Roronoa Zoro",
      opponent: "OP05-060",
      opponent_name: "Olivier",
      games: 80,
      wins: 44,
      win_rate: 0.55,
      interval: [0.44, 0.66],
      too_few_games: false,
      going_first: { games: 40, wins: 24, win_rate: 0.6, interval: [0.45, 0.74], too_few_games: false },
      going_second: { games: 3, wins: null, win_rate: null, interval: null, too_few_games: true },
      lines: [{ ...withLine("optional_accepted:OP01-016"), description: "the optional effect of Nami (OP01-016) accepted" }],
    };
    const blocks = adaptToolResult("sim_stats", JSON.stringify(payload))!;
    expect(blocks.every((b) => b.type === "search_result")).toBe(true);
    const results = blocks as SearchResultBlock[];
    expect(results.map((b) => b.source)).toEqual(["botsim:OP01-001~OP05-060", "botsim:OP01-001~OP05-060#optional_accepted:OP01-016"]);
    const text = (b: SearchResultBlock) => b.content.map((c) => c.text).join("\n");
    expect(text(results[0]!)).toContain("Overall: 55.0% win rate, 44 wins in 80 games (95% interval 44.0% to 66.0%).");
    expect(text(results[0]!)).toContain("Going second: too few games (3) for a win rate.");
    expect(text(results[0]!)).toContain("simulated games between bots, not games between people and not tournament results");
    expect(text(results[1]!)).toContain("In bot games where the line happened: 70.0% win rate, 21 wins in 30 games (95% interval 52.0% to 83.0%).");
    expect(text(results[1]!)).toContain("In bot games where it did not: 50.0% win rate, 25 wins in 50 games");
  });

  it("cites a leader overview and the all-leaders list as botsim: sources too (#635)", () => {
    const overview = adaptToolResult("sim_stats", JSON.stringify({ days: 90, levels: "hard/hard", leader: "OP01-001", overall: { games: 9, wins: 5, win_rate: 0.556, interval: [0.27, 0.8], too_few_games: false }, opponents: [{ opponent: "OP05-060", games: 6, wins: null, win_rate: null, interval: null, too_few_games: true }], lines: [] }))!;
    expect((overview as SearchResultBlock[]).map((b) => b.source)).toEqual(["botsim:OP01-001", "botsim:OP01-001~OP05-060"]);
    const all = adaptToolResult("sim_stats", JSON.stringify({ days: 90, levels: "hard/hard", total_games: 10, leaders: [{ leader: "OP01-001", share: 0.5, games: 10, wins: 6, win_rate: 0.6, interval: [0.3, 0.85], too_few_games: false }] }))!;
    expect((all as SearchResultBlock[]).map((b) => b.source)).toEqual(["botsim:OP01-001"]);
  });

  it("cites bot games in a search as botgame: sources labelled as simulated, beside player games as game: sources (#635)", () => {
    const blocks = adaptToolResult("search_matches", JSON.stringify({ total: 2, offset: 0, window_days: 90, games: [{ ...playerGame }, { ...botGame, kind: "bot game (Hard vs Hard self-play)" }] }))!;
    expect(blocks.every((b) => b.type === "search_result")).toBe(true);
    const results = blocks as SearchResultBlock[];
    expect(results.slice(0, 2).map((b) => b.source)).toEqual(["game:g_1", "botgame:b_1"]);
    expect(results[1]!.content.map((c) => c.text).join(" ")).toContain("bot game (Hard vs Hard self-play) on optcgduel.app's engine, simulated between bots, not a game between people");
    expect(results[0]!.content.map((c) => c.text).join(" ")).not.toMatch(/bot/);
  });

  it("cites a position check with the options, the move that was played and the bot-simulation caveat (#635)", () => {
    const payload = {
      sourceId: "position:m1#t5s1",
      game: { id: "m1", kind: "match", seat: "you" },
      turn: 5,
      step: 1,
      decisionsThisTurn: 3,
      activeSeat: 0,
      phase: "main",
      winChance: 48,
      optionCount: 4,
      options: [
        { rank: 1, label: "Play Nami (OP01-016)", winChance: 61, samples: 12, botPick: true },
        { rank: 2, label: "End the turn", winChance: 44, samples: 12, botPick: false },
      ],
      actual: { label: "End the turn", rank: 2, winChance: 44, matchedOption: true },
      notes: ["estimates"],
    };
    const blocks = adaptToolResult("analyze_position", JSON.stringify(payload))!;
    expect(blocks.every((b) => b.type === "search_result")).toBe(true);
    const [position] = blocks as SearchResultBlock[];
    expect(position!.source).toBe("position:m1#t5s1");
    const text = position!.content.map((c) => c.text).join("\n");
    expect(text).toContain("Estimated chance you win from this position: 48%.");
    expect(text).toContain("Option 1 of 4: Play Nami (OP01-016) — estimated 61% to win (12 simulated games), the bot's pick.");
    expect(text).toContain("What was actually played: End the turn — rank 2 of 4, estimated 44% to win.");
    expect(text).toContain("bot simulations");
  });

  it("puts the biggest win-chance swings of a review in its overview source (#635)", () => {
    const [overview] = gameResults("match", "m1", { yourLeader: "A", opponentLeader: "B", wentFirst: true, log: [], biggestSwings: [{ turn: 5, change: -38, you: 40 }, { turn: 3, change: 28, you: 80 }] });
    expect(overview!.content.map((c) => c.text)).toContain("Biggest swings in your estimated win chance (bot-simulation estimates): turn 5 (-38 points, to 40%), turn 3 (+28 points, to 80%).");
    const [plain] = gameResults("match", "m1", { yourLeader: "A", opponentLeader: "B", wentFirst: true, log: [] });
    expect(plain!.content.some((c) => c.text.includes("swings"))).toBe(false);
  });
});
