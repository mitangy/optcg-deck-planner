import type { MatchReplay, Seat } from "@optcg/rules";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@optcg/rules", async (original) => ({ ...(await original<typeof import("@optcg/rules")>()), winProbability: vi.fn() }));

const { winProbability } = await import("@optcg/rules");
const { biggestSwings, narrateReplay, reviewMatch } = await import("./matches");
const { finishedGame } = await import("./testFixtures");

/** Seat 0's chance by turn: flat, then +28 at turn 3, -38 at turn 5, -16 at turn 7, +24 at turn 9. Seat 1 gets the rest. */
const TABLE: Record<number, number> = { 1: 0.5, 2: 0.52, 3: 0.8, 4: 0.78, 5: 0.4, 6: 0.41, 7: 0.25, 8: 0.26, 9: 0.5 };
const chance = (turn: number) => TABLE[turn] ?? 0.5;

const { replay } = finishedGame(10);

beforeEach(() => {
  vi.mocked(winProbability).mockReset();
  vi.mocked(winProbability).mockImplementation((state, seat: Seat) => (seat === 0 ? chance(state.turnNumber) : 1 - chance(state.turnNumber)));
});

const lineAfter = (log: string[], pattern: RegExp) => {
  const at = log.findIndex((l) => pattern.test(l));
  return { at, next: log[at + 1] };
};

describe("win chance in reviews (#635)", () => {
  it("gives the reviewing seat's chance at each turn start, the other seat's when it reviews (#635)", () => {
    const first = narrateReplay(replay, 0, { winChance: true });
    expect(first.winChanceByTurn!.slice(0, 5).map((w) => [w.turn, w.you])).toEqual([[1, 50], [2, 52], [3, 80], [4, 78], [5, 40]]);
    expect(first.winChanceByTurn![2]!.change).toBe(28);
    const second = narrateReplay(replay, 1, { winChance: true });
    expect(second.winChanceByTurn!.slice(0, 5).map((w) => w.you)).toEqual([50, 48, 20, 22, 60]);
    expect(first.log).toContain("Estimated chance you win from here: 80% (a bot-simulation estimate, not a result).");
  });

  it("marks the three biggest swings of at least eight points as turning points, right after that turn's estimate (#635)", () => {
    const r = narrateReplay(replay, 0, { winChance: true });
    expect(r.biggestSwings!.map((s) => [s.turn, s.change])).toEqual([[5, -38], [3, 28], [9, 24]]);
    expect(r.log.filter((l) => l.startsWith("Turning point:"))).toHaveLength(3);
    const t3 = lineAfter(r.log, /^Estimated chance you win from here: 80%/);
    expect(t3.next).toBe("Turning point: your estimated win chance rose from 52% to 80% (+28 points) over the previous turn.");
    const t5 = lineAfter(r.log, /^Estimated chance you win from here: 40%/);
    expect(t5.next).toBe("Turning point: your estimated win chance fell from 78% to 40% (-38 points) over the previous turn.");
    // Turn 7 moved 16 points but is the fourth biggest; turn 2 moved 2 and is no swing at all.
    expect(lineAfter(r.log, /^Estimated chance you win from here: 25%/).next).not.toMatch(/^Turning point/);
    expect(lineAfter(r.log, /^Estimated chance you win from here: 52%/).next).not.toMatch(/^Turning point/);
  });

  it("orders swings by size whichever way they went, and ignores moves under eight points (#635)", () => {
    const pts = [
      { turn: 1, winChance: 0.5, change: null },
      { turn: 2, winChance: 0.6, change: 10 },
      { turn: 3, winChance: 0.3, change: -30 },
      { turn: 4, winChance: 0.37, change: 7 },
      { turn: 5, winChance: 0.2, change: -17 },
      { turn: 6, winChance: 0.45, change: 25 },
    ];
    expect(biggestSwings(pts).map((p) => p.turn)).toEqual([3, 6, 5]);
    expect(biggestSwings(pts.slice(0, 2)).map((p) => p.turn)).toEqual([2]);
    expect(biggestSwings([pts[0]!, { turn: 2, winChance: 0.57, change: 7 }])).toEqual([]);
  });

  it("estimates every turn even when only one turn is read, so a swing still has its previous turn (#635)", () => {
    const r = narrateReplay(replay, 0, { winChance: true, fromTurn: 5, toTurn: 5 });
    expect(r.log.filter((l) => l.startsWith("Estimated chance"))).toEqual(["Estimated chance you win from here: 40% (a bot-simulation estimate, not a result)."]);
    expect(r.log.filter((l) => l.startsWith("Turning point:"))).toEqual(["Turning point: your estimated win chance fell from 78% to 40% (-38 points) over the previous turn."]);
    expect(r.winChanceByTurn!.length).toBeGreaterThan(5);
  });

  it("gives no estimate for a game that has no recorded end, where the opponent's hand is still secret (#635)", () => {
    const open: MatchReplay = { ...replay, end: undefined };
    const r = narrateReplay(open, 0, { winChance: true });
    expect(r.winChanceByTurn).toBeUndefined();
    expect(r.log.some((l) => l.startsWith("Estimated chance"))).toBe(false);
    expect(winProbability).not.toHaveBeenCalled();
  });

  it("review_match includes the estimates unless they are switched off (#635)", async () => {
    const api = { baseUrl: "https://api.test", serviceSecret: "svc", fetchImpl: (async () => new Response(JSON.stringify({ match_id: "m1", your_seat: 0, replay }), { status: 200 })) as unknown as typeof fetch };
    const on = await reviewMatch(api, "tok", "m1");
    expect(on.log.some((l) => l.startsWith("Estimated chance you win"))).toBe(true);
    expect((on as { biggestSwings?: unknown[] }).biggestSwings).toHaveLength(3);
    const off = await reviewMatch(api, "tok", "m1", { winChance: false });
    expect(off.log.some((l) => l.startsWith("Estimated chance"))).toBe(false);
  });
});
