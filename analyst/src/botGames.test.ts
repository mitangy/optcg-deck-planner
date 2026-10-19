import { describe, expect, it } from "vitest";
import { cardsOfLine, compareLines, lessonText, linesOf, realLineStats, tallyReplay, toBatches, uploadBotGames, type BotGameUpload, type LineRow } from "./botGames";
import { botGame } from "./testFixtures";

const SEEDS = [1, 2, 3, 4];

describe("tallies of saved bot games (#635)", () => {
  it("re-counts the lines each seat played exactly as the self-play recorder counted them (#635)", () => {
    let seenLines = 0;
    for (const seed of SEEDS) {
      const played = botGame(seed, "normal");
      const counted = tallyReplay(played.replay);
      for (const seat of [0, 1] as const) {
        const { decisions: _d, decisionMs: _m, ...recorded } = played.lines[seat];
        const { decisions, decisionMs: _x, ...again } = counted.tallies[seat];
        expect(again).toEqual(recorded);
        expect(decisions).toBe(played.replay.intents.filter((i) => i.seat === seat).length);
        seenLines += recorded.activations + Object.keys(recorded.counterEvents).length + Object.keys(recorded.optionalAccepts).length + Object.keys(recorded.mainEvents).length;
      }
      expect(counted.turns).toBe(played.turns);
    }
    // The games played some advanced lines, so equal tallies mean something.
    expect(seenLines).toBeGreaterThan(0);
  });
});

describe("named lines (#635)", () => {
  it("turns a tally into the lines the backend counts, with a line for any Counter Event and any cheat-out (#635)", () => {
    const tally = {
      leaderActivations: 1,
      activationsByCard: { "OP01-001": 2, "OP01-002": 0 },
      optionalAccepts: { "OP08-058": 1 },
      optionalDeclines: { "OP08-059": 3 },
      counterEvents: { "OP01-026": 1 },
      cheatOuts: { "OP01-016 via OP02-004": 1 },
      mainEvents: { "OP03-040": 2 },
    };
    expect([...linesOf(tally)].sort()).toEqual(
      ["activation:OP01-001", "cheat_out", "cheat_out:OP01-016 via OP02-004", "counter_event", "counter_event:OP01-026", "leader_activation", "main_event:OP03-040", "optional_accepted:OP08-058", "optional_declined:OP08-059"].sort(),
    );
    expect(linesOf({}).size).toBe(0);
  });
});

const game = (index: number): BotGameUpload => ({ index, replay: { schema: 1, rulesVersion: "t", registryHash: "t", seed: index, firstSeat: 0, skipMulligans: false, players: [{ leaderId: "OP01-001", deck: [] }, { leaderId: "OP01-001", deck: [] }], intents: [] }, tallies: [tallyOf(), tallyOf()], turns: 5 });
const tallyOf = () => ({ activations: 0, leaderActivations: 0, activationsByCard: {}, optionalAccepts: {}, optionalDeclines: {}, counterEvents: {}, cheatOuts: {}, mainEvents: {}, decisions: 0, decisionMs: 0 });

describe("uploading bot games (#635)", () => {
  it("splits games into batches by count and by size, keeping their order (#635)", () => {
    const games = Array.from({ length: 7 }, (_, i) => game(i));
    const size = JSON.stringify(games[0]).length;
    expect(toBatches(games, 10 * size, 3).map((b) => b.map((g) => g.index))).toEqual([[0, 1, 2], [3, 4, 5], [6]]);
    expect(toBatches(games, Math.floor(2.5 * size), 25).map((b) => b.map((g) => g.index))).toEqual([[0, 1], [2, 3], [4, 5], [6]]);
    expect(toBatches([], 100)).toEqual([]);
  });

  it("posts every batch with the service secret and the batch id, and adds up the answers (#635)", async () => {
    const calls: { url: string; headers: Record<string, string>; body: { batch_id: string; levels: string; games: { index: number; levels?: string }[] } }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      calls.push({ url, headers: init.headers as Record<string, string>, body });
      return new Response(JSON.stringify({ accepted: body.games.length - 1, duplicates: 1, rejected: [{ index: body.games[0].index, reason: "bad" }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const games = [game(0), { ...game(1), levels: "normal/hard" }, game(2)];
    const size = JSON.stringify(games[0]).length;
    const r = await uploadBotGames({ baseUrl: "https://api.test", serviceSecret: "svc", fetchImpl }, "night-1", "hard/hard", games, { maxBytes: size + 10 });
    expect(calls).toHaveLength(3);
    expect(calls.every((c) => c.url === "https://api.test/analyst/bot-games" && c.headers["X-Analyst-Service"] === "svc" && c.body.batch_id === "night-1" && c.body.levels === "hard/hard")).toBe(true);
    expect(calls.map((c) => c.body.games[0]!.index)).toEqual([0, 1, 2]);
    expect(calls[1]!.body.games[0]!.levels).toBe("normal/hard");
    expect(r).toEqual({ accepted: 0, duplicates: 3, rejected: [{ index: 0, reason: "bad" }, { index: 1, reason: "bad" }, { index: 2, reason: "bad" }] });
  });
});

const row = (line: string, withGames: number, withRate: number, withoutGames: number, withoutRate: number): LineRow => ({
  line,
  description: `desc of ${line}`,
  with: { games: withGames, wins: Math.round(withGames * withRate), win_rate: withRate },
  without: { games: withoutGames, wins: Math.round(withoutGames * withoutRate), win_rate: withoutRate },
});
const real = (line: string, withGames: number, withWins: number, withoutGames: number, withoutWins: number) => ({ line, withGames, withWins, withoutGames, withoutWins });

describe("lessons both sources agree on (#635)", () => {
  it("keeps a line only when bot and real games both move the same way by at least ten points with enough games (#635)", () => {
    const bot = [
      row("agree", 40, 0.7, 60, 0.5),
      row("opposite", 40, 0.7, 60, 0.5),
      row("tiny-real-gap", 40, 0.7, 60, 0.5),
      row("tiny-bot-gap", 40, 0.55, 60, 0.5),
      row("few-bot", 19, 0.9, 60, 0.4),
      row("few-bot-without", 40, 0.9, 19, 0.4),
      row("few-real", 40, 0.7, 60, 0.5),
      row("worse", 40, 0.3, 60, 0.5),
      row("not-in-real", 40, 0.9, 60, 0.4),
    ];
    const realGames = [
      real("agree", 10, 7, 20, 10),
      real("opposite", 10, 3, 20, 10),
      real("tiny-real-gap", 10, 6, 20, 11),
      real("tiny-bot-gap", 10, 8, 20, 10),
      real("few-bot", 10, 8, 20, 8),
      real("few-bot-without", 10, 8, 20, 8),
      real("few-real", 7, 6, 20, 10),
      real("worse", 10, 3, 20, 12),
    ];
    const out = compareLines(bot, realGames);
    expect(out.map((c) => [c.line, c.direction])).toEqual([["worse", "worse"], ["agree", "better"]]);
    expect(out[1]!.real).toEqual({ withRate: 0.7, withoutRate: 0.5, withGames: 10, withoutGames: 20 });
    expect(out[1]!.bot.withGames).toBe(40);
  });

  it("counts real games with and without each line (#635)", () => {
    const stats = realLineStats([
      { lines: new Set(["a", "b"]), won: true },
      { lines: new Set(["a"]), won: false },
      { lines: new Set<string>(), won: true },
      { lines: new Set(["b"]), won: true },
    ]);
    expect(stats.find((s) => s.line === "a")).toEqual({ line: "a", withGames: 2, withWins: 1, withoutGames: 2, withoutWins: 2 });
    expect(stats.find((s) => s.line === "b")).toEqual({ line: "b", withGames: 2, withWins: 2, withoutGames: 2, withoutWins: 1 });
  });

  it("writes a lesson that keeps real-game and bot numbers apart and picks the cards out of the line (#635)", () => {
    const [c] = compareLines([row("optional_accepted:OP08-058", 40, 0.7, 60, 0.5)], [real("optional_accepted:OP08-058", 10, 7, 20, 10)]);
    const text = lessonText(c!, "Charlotte Pudding");
    expect(text).toContain("70% vs 50% (10 and 20 games) in real games");
    expect(text).toContain("70% vs 50% (40 and 60 games) in bot simulations");
    expect(text).toContain("more often");
    expect(text.length).toBeLessThanOrEqual(1000);
    expect(cardsOfLine("cheat_out:OP01-016 via OP02-004")).toEqual(["OP01-016", "OP02-004"]);
  });
});
