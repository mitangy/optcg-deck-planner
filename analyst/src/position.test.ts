import { replayMatch, replayStart, type Intent, type MatchReplay, type MatchState, type Seat } from "@optcg/rules";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@optcg/rules", async (original) => ({ ...(await original<typeof import("@optcg/rules")>()), rankOptions: vi.fn(), winProbability: vi.fn(() => 0.5) }));

const { rankOptions } = await import("@optcg/rules");
const { analyzePosition } = await import("./position");
const { buildTools } = await import("./server");
const { loadCatalog } = await import("./catalog");
const { finishedGame } = await import("./testFixtures");

const { replay } = finishedGame(8);

/** The state before each recorded intent, found by replaying with replayMatch (not the code under test). */
function statesBefore(r: MatchReplay): MatchState[] {
  const before: MatchState[] = [replayStart(r)];
  replayMatch(r, (step) => before.push(step.state));
  return before;
}
const before = statesBefore(replay);
const decisionsOf = (seat: Seat, turn: number) => replay.intents.map((x, i) => ({ i, seat: x.seat, turn: before[i]!.turnNumber })).filter((d) => d.seat === seat && d.turn === turn);

/** A seat and turn where that seat decided at least twice. */
const busy = (() => {
  for (const seat of [0, 1] as Seat[]) for (let turn = 1; turn <= before[before.length - 1]!.turnNumber; turn += 1) if (decisionsOf(seat, turn).length >= 2) return { seat, turn };
  throw new Error("no busy turn");
})();

/** A turn where side B decided at least twice and side A at least once, for the tests that ask for a side by letter. */
const shared = (() => {
  for (let turn = 1; turn <= before[before.length - 1]!.turnNumber; turn += 1) if (decisionsOf(1, turn).length >= 2 && decisionsOf(0, turn).length >= 1) return { turn };
  throw new Error("no turn where both sides decided");
})();

const decoy = { type: "__decoy" } as unknown as Intent;
const option = (intent: Intent, label: string, winChance: number, isBotPick = false) => ({ intent, label, winChance, samples: 12, isBotPick });

beforeEach(() => {
  vi.mocked(rankOptions).mockReset();
});

describe("position analysis (#635)", () => {
  it("analyzes the seat's own decision at the asked turn and step, from the state just before it (#635)", () => {
    vi.mocked(rankOptions).mockReturnValue([option(decoy, "Decoy", 0.6, true)]);
    const dec = decisionsOf(busy.seat, busy.turn);
    const second = analyzePosition(replay, { seat: busy.seat, turn: busy.turn, step: 1 });
    expect(vi.mocked(rankOptions).mock.calls[0]![0]).toEqual(before[dec[1]!.i]);
    expect(vi.mocked(rankOptions).mock.calls[0]![1]).toBe(busy.seat);
    expect(second).toMatchObject({ turn: busy.turn, step: 1, decisionsThisTurn: dec.length });
    analyzePosition(replay, { seat: busy.seat, turn: busy.turn });
    expect(vi.mocked(rankOptions).mock.calls[1]![0]).toEqual(before[dec[0]!.i]);
  });

  it("reports where the move that was really played ranks, matching it by content not key order (#635)", () => {
    const dec = decisionsOf(busy.seat, busy.turn);
    const played = replay.intents[dec[0]!.i]!.intent;
    const reordered = Object.fromEntries(Object.entries(played).reverse()) as unknown as Intent;
    vi.mocked(rankOptions).mockReturnValue([option(decoy, "Best decoy", 0.7, true), option(reordered, "The played move", 0.512), option(decoy, "Third", 0.2)]);
    const r = analyzePosition(replay, { seat: busy.seat, turn: busy.turn, top: 2 });
    expect(r.options.map((o) => [o.rank, o.label, o.winChance, o.botPick])).toEqual([[1, "Best decoy", 70, true], [2, "The played move", 51, false]]);
    expect(r.optionCount).toBe(3);
    expect(r.actual).toEqual({ label: "The played move", rank: 2, winChance: 51, matchedOption: true });
  });

  it("says so when the played move is not among the ranked options (#635)", () => {
    vi.mocked(rankOptions).mockReturnValue([option(decoy, "Only option", 0.6, true)]);
    const r = analyzePosition(replay, { seat: busy.seat, turn: busy.turn });
    expect(r.actual).toMatchObject({ rank: null, winChance: null, matchedOption: false });
    expect(r.notes.join(" ")).toMatch(/not among the ranked options/);
  });

  it("keeps the search time within bounds (#635)", () => {
    vi.mocked(rankOptions).mockReturnValue([]);
    analyzePosition(replay, { seat: busy.seat, turn: busy.turn, budgetMs: 999_999 });
    analyzePosition(replay, { seat: busy.seat, turn: busy.turn, budgetMs: 1 });
    analyzePosition(replay, { seat: busy.seat, turn: busy.turn });
    expect(vi.mocked(rankOptions).mock.calls.map((c) => c[2]?.budgetMs)).toEqual([5000, 50, 1500]);
  });

  it("refuses an unfinished game, a turn the seat did not play and a step that does not exist (#635)", () => {
    vi.mocked(rankOptions).mockReturnValue([]);
    expect(() => analyzePosition({ ...replay, end: undefined }, { seat: 0, turn: 1 })).toThrow(/finished games only/);
    expect(() => analyzePosition(replay, { seat: 0, turn: 500 })).toThrow(/no decision in turn 500/);
    const n = decisionsOf(busy.seat, busy.turn).length;
    expect(() => analyzePosition(replay, { seat: busy.seat, turn: busy.turn, step: n })).toThrow(new RegExp(`had ${n} decisions in turn ${busy.turn}; step runs from 0 to ${n - 1}`));
    expect(rankOptions).not.toHaveBeenCalled();
  });
});

describe("the analyze_position tool (#635)", () => {
  const catalog = loadCatalog();
  const serve = (replayBody: MatchReplay, mySeat = 1) => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string> });
      return new Response(JSON.stringify({ match_id: "m 1", game_id: "x_1", your_seat: mySeat, replay: replayBody }), { status: 200 });
    }) as unknown as typeof fetch;
    return { calls, api: { baseUrl: "https://api.test", serviceSecret: "svc", fetchImpl } };
  };
  const run = async (api: ReturnType<typeof serve>["api"], args: Record<string, unknown>, personal = false) => {
    const tools = buildTools(catalog, undefined, personal ? { api, token: "tok" } : undefined, { stats: api });
    const result = await tools.find((t) => t.name === "analyze_position")!.run(args);
    return { isError: result.isError, body: result.content[0]!.text };
  };

  it("reads a bot game from the bot endpoint and an archive game from the player corpus, as the side asked for (#635)", async () => {
    vi.mocked(rankOptions).mockReturnValue([option(decoy, "Decoy", 0.6, true)]);
    const bot = serve(replay);
    const b = await run(bot.api, { gameId: "b_xyz", side: "B", turn: shared.turn, step: 1 });
    expect(bot.calls).toEqual([{ url: "https://api.test/analyst/bot-games/b_xyz/replay", headers: { "X-Analyst-Service": "svc" } }]);
    const out = JSON.parse(b.body);
    expect(out).toMatchObject({ sourceId: `position:x_1#t${shared.turn}s1`, game: { kind: "botgame", seat: "Player B", leader: replay.players[1].leaderId } });
    expect(vi.mocked(rankOptions).mock.calls[0]![1]).toBe(1);
    const archive = serve(replay);
    await run(archive.api, { gameId: "g_abc", turn: shared.turn });
    expect(archive.calls[0]!.url).toBe("https://api.test/analyst/corpus/games/g_abc/replay");
    expect(vi.mocked(rankOptions).mock.calls[1]![1]).toBe(0);
  });

  it("analyzes the player's own seat for a match, only on a personal link (#635)", async () => {
    vi.mocked(rankOptions).mockReturnValue([option(decoy, "Decoy", 0.6, true)]);
    const mine = serve(replay, busy.seat);
    const ok = await run(mine.api, { matchId: "m 1", turn: busy.turn }, true);
    expect(mine.calls).toEqual([{ url: "https://api.test/analyst/matches/m%201/replay", headers: { "X-Analyst-Token": "tok", "X-Analyst-Service": "svc" } }]);
    expect(JSON.parse(ok.body)).toMatchObject({ sourceId: `position:m 1#t${busy.turn}`, game: { seat: "you", kind: "match" } });
    expect(vi.mocked(rankOptions).mock.calls[0]![1]).toBe(busy.seat);
    const anon = await run(mine.api, { matchId: "m 1", turn: busy.turn });
    expect(anon).toMatchObject({ isError: true });
    expect(anon.body).toMatch(/personal link/);
    expect((await run(mine.api, { turn: 1 })).isError).toBe(true);
    expect((await run(mine.api, { matchId: "a", gameId: "g_b", turn: 1 }, true)).isError).toBe(true);
  });
});
