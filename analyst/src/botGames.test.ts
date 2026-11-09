import { describe, expect, it } from "vitest";
import { cardsOfLine, compareLines, fetchHumanBotGames, evidenceSummary, leadersWithGames, lessonText, lessonsForLeader, linesOf, postBotLesson, realLineStats, tallyReplay, toBatches, topCandidates, uploadBotGames, type BotGameUpload, type LineRow } from "./botGames";
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

describe("downloading Play vs Bot games (#1202)", () => {
  const entry = (id: number) => ({ id, created_at: "2026-11-09T00:00:00Z", bot_level: "hard", replay: game(id).replay });
  it("pages with the last next_after_id using the service secret until a page comes back empty (#1202)", async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const pages: Record<string, unknown> = {
      "0": { games: [entry(3), entry(5)], next_after_id: 5 },
      "5": { games: [entry(9)], next_after_id: 9 },
      "9": { games: [], next_after_id: 9 },
    };
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string> });
      return new Response(JSON.stringify(pages[new URL(url).searchParams.get("after_id")!]), { status: 200 });
    }) as unknown as typeof fetch;
    const seen: number[][] = [];
    const total = await fetchHumanBotGames({ baseUrl: "https://api.test/", serviceSecret: "svc", fetchImpl }, (g) => void seen.push(g.map((x) => x.id)), { pageSize: 2 });
    expect(seen).toEqual([[3, 5], [9]]);
    expect(total).toBe(3);
    expect(calls.map((c) => c.url)).toEqual([
      "https://api.test/analyst/human-bot-games?after_id=0&limit=2",
      "https://api.test/analyst/human-bot-games?after_id=5&limit=2",
      "https://api.test/analyst/human-bot-games?after_id=9&limit=2",
    ]);
    expect(calls.every((c) => c.headers["X-Analyst-Service"] === "svc")).toBe(true);
  });

  it("stops instead of looping when the API does not move forward (#1202)", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      if (calls > 3) throw new Error("kept asking");
      return new Response(JSON.stringify({ games: [entry(1)], next_after_id: 0 }), { status: 200 });
    }) as unknown as typeof fetch;
    const total = await fetchHumanBotGames({ baseUrl: "https://api.test", serviceSecret: "svc", fetchImpl }, () => {});
    expect([calls, total]).toEqual([1, 1]);
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

describe("the weekly bot lessons run (#915)", () => {
  it("checks every leader with at least the minimum of bot games, in the order given (#915)", () => {
    const sim = { leaders: [{ leader: "OP01-001", games: 200 }, { leader: "OP05-060", games: 60 }, { leader: "OP02-001", games: 59 }] };
    expect(leadersWithGames(sim, 60)).toEqual(["OP01-001", "OP05-060"]);
    expect(leadersWithGames({}, 60)).toEqual([]);
  });

  it("keeps the best few lines per leader, one lesson per line (#915)", () => {
    const bot = ["a", "b", "c", "d"].map((l, i) => row(l, 40, 0.9 - i * 0.05, 60, 0.4));
    const found = compareLines(bot, ["a", "b", "c", "d"].map((l) => real(l, 10, 8, 20, 8)));
    expect(found.map((c) => c.line)).toEqual(["a", "b", "c", "d"]);
    expect(topCandidates(found, 3).map((c) => c.line)).toEqual(["a", "b", "c"]);
    expect(topCandidates([found[0]!, found[0]!, found[1]!], 3).map((c) => c.line)).toEqual(["a", "b"]);
  });

  it("states the bot and the real numbers apart in the evidence the reviewer sees (#915)", () => {
    const [c] = compareLines([row("counter_event", 40, 0.7, 60, 0.5)], [real("counter_event", 10, 6, 20, 5)]);
    expect(evidenceSummary(c!)).toBe("counter_event: bot 70% vs 50% (40/60 games); real 60% vs 25% (10/20 games)");
  });

  it("posts a lesson with the service secret and no personal token, and reports a skipped one (#915)", async () => {
    const calls: { url: string; method: string; headers: Record<string, string>; body: unknown }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method as string, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) });
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }) as unknown as typeof fetch;
    const lesson = { text: "With Zoro, games with it were won more often.", leader_id: "OP01-001", cards: ["OP01-016"], evidence: "x" };
    const r = await postBotLesson({ baseUrl: "https://api.test/", serviceSecret: "svc", fetchImpl }, lesson);
    expect(r).toEqual({ skipped: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.test/analyst/bot-lessons");
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.headers["X-Analyst-Service"]).toBe("svc");
    expect(calls[0]!.headers["X-Analyst-Token"]).toBeUndefined();
    expect(calls[0]!.body).toEqual(lesson);
  });

  it("asks for the leader's hard-vs-hard line stats, and reads no real games when the bots have no lines (#915)", async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ lines: [], games: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const run = await lessonsForLeader({ baseUrl: "https://api.test", serviceSecret: "svc", fetchImpl }, "OP01-001", { opponent: "OP05-060" });
    expect(run).toMatchObject({ leader: "OP01-001", botLines: 0, realGames: 0, lessons: [] });
    expect(urls).toEqual(["https://api.test/analyst/stats/sim?leader=OP01-001&levels=hard%2Fhard&opponent=OP05-060"]);
  });
});
