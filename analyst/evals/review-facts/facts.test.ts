import { describe, expect, it } from "vitest";
import { narrateReplay } from "../../src/matches";
import { fixtureReplay } from "./game";
import { gameFacts } from "./facts";

const replay = fixtureReplay();
const facts = gameFacts(replay);
const turn = (n: number) => facts.turns.find((t) => t.turn === n)!;

describe("review facts from a replay", () => {
  it("counts turns like the Turn N headers a review reads, for both seats (#675)", () => {
    for (const seat of [0, 1] as const) {
      const headers = narrateReplay(replay, seat, { winChance: true, maxLines: 1500 }).log.filter((l) => l.startsWith("--- Turn"));
      const mine = facts.turns.map((t) => `--- Turn ${t.turn} (${t.activeSeat === seat ? "your" : "opponent's"} turn) ---`);
      expect(mine).toEqual(headers);
    }
  });

  it("records who went first, the mulligans and how the game ended (#675)", () => {
    expect(facts.firstSeat).toBe(0);
    expect(facts.mulligans).toEqual([false, false]);
    expect(facts.result).toEqual({ winner: 1, reason: "leader_battle_at_zero_life", finalTurn: 10 });
    expect(facts.finalLife).toEqual([0, 1]);
  });

  it("puts each play, attack, K.O. and Life hit on the turn it happened (#675)", () => {
    expect(turn(3).plays.map((p) => [p.seat, p.name])).toEqual([[0, "Pearl"], [0, "Magura"]]);
    expect(turn(3).attacks).toMatchObject([{ seat: 0, attackerName: "Luffy & Ace", target: "leader", hit: true }]);
    expect(turn(3).lifeTaken.map((l) => [l.seat, l.name])).toEqual([[1, "Captains Assembled"]]);
    expect(turn(3).triggersAccepted).toMatchObject([{ seat: 1, name: "Captains Assembled" }]);
    expect(turn(8).kos.map((k) => [k.seat, k.name])).toEqual([[0, "Pearl"], [0, "Magura"]]);
    expect(turn(10).lifeTaken.map((l) => l.seat)).toEqual([0, 0]);
  });

  it("keeps a block's blocker and a counter's cards with the attack they belong to (#675)", () => {
    const marine = turn(8).attacks.find((a) => a.attackerName === "Older Brother Marine")!;
    expect(marine).toMatchObject({ seat: 1, targetName: "Diamante", blockedBy: "OP03-031" });
    const smoker = turn(10).attacks.find((a) => a.attackerName === "Smoker")!;
    expect(smoker).toMatchObject({ seat: 1, counters: ["OP06-014", "OP02-035"], hit: false });
  });

  it("gives the Life range of a turn, start and end (#675)", () => {
    expect(turn(8).lifeAtStart).toEqual([4, 1]);
    expect(turn(8).lifeAtEnd).toEqual([2, 1]);
    expect(turn(8).lifeRange[0]).toEqual([2, 4]);
  });

  it("stops at the move that no longer replays and says where (#675)", () => {
    const broken = { ...replay, intents: replay.intents.map((x, i) => (i === 50 ? { seat: x.seat, intent: { type: "play_card" as const, handIndex: 99 } } : x)) };
    const f = gameFacts(broken);
    expect(f.divergedAt).toMatch(/diverged at intent 50/);
    expect(f.turns.length).toBeLessThan(facts.turns.length);
  });
});
