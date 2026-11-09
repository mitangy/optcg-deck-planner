import { describe, expect, it } from "vitest";
import type { Seat } from "../../net/protocol";
import { diceSlot, diceStatus, rollSide, type DiceView } from "./diceModel";

const names: Record<Seat, string> = { 0: "Luffy", 1: "Zoro" };
/** The viewer is "You"; a spectator (me null) sees both names. */
const nameFor = (me: Seat | null) => (seat: Seat) => (me === seat ? "You" : names[seat]);

/** Seat 1 rolls, seat 0 calls. */
const base: DiceView = { roller: 1, caller: 0, step: "call", call: null, roll: null, winner: null, me: 0, tumbling: false };
const view = (over: Partial<DiceView>): DiceView => ({ ...base, ...over });

describe("dice card words and controls (#1190)", () => {
  it("splits the die at 3 and 4", () => {
    expect([1, 2, 3].map(rollSide)).toEqual(["low", "low", "low"]);
    expect([4, 5, 6].map(rollSide)).toEqual(["high", "high", "high"]);
  });

  it("tells each player what to do at the call step, and the roller's Roll waits", () => {
    expect(diceStatus(view({}), nameFor(0))).toBe("You call it: High or Low?");
    expect(diceSlot(view({}), nameFor(0))).toEqual({ kind: "call", enabled: true, picked: null });
    const roller = view({ me: 1 });
    expect(diceStatus(roller, nameFor(1))).toBe("Waiting for Luffy to call…");
    expect(diceSlot(roller, nameFor(1))).toEqual({ kind: "roll", enabled: false });
  });

  it("opens Roll once the call is in, and shows the caller their pick", () => {
    const caller = view({ step: "roll", call: "low" });
    expect(diceStatus(caller, nameFor(0))).toBe("You called Low. Zoro is rolling…");
    expect(diceSlot(caller, nameFor(0))).toEqual({ kind: "call", enabled: false, picked: "low" });
    const roller = view({ step: "roll", call: "low", me: 1 });
    expect(diceStatus(roller, nameFor(1))).toBe("Luffy called Low. Roll the die!");
    expect(diceSlot(roller, nameFor(1))).toEqual({ kind: "roll", enabled: true });
  });

  it("names the roll and its winner, and gives the choice only to the winner after the die lands", () => {
    const won = view({ step: "choose", call: "high", roll: 5, winner: 0 });
    expect(diceStatus(won, nameFor(0))).toBe("Rolled 5: High. You win!");
    expect(diceSlot(won, nameFor(0))).toEqual({ kind: "choose", enabled: true });
    expect(diceSlot({ ...won, tumbling: true }, nameFor(0))).toEqual({ kind: "choose", enabled: false });
    expect(diceStatus({ ...won, tumbling: true }, nameFor(0))).toBe("Rolling…");

    const lost = view({ step: "choose", call: "high", roll: 2, winner: 1 });
    expect(diceStatus(lost, nameFor(0))).toBe("Rolled 2: Low. Zoro wins");
    expect(diceSlot(lost, nameFor(0))).toEqual({ kind: "wait", text: "Zoro is choosing…" });
  });

  it("gives a spectator the same words with names and no controls", () => {
    const spec = view({ step: "choose", call: "low", roll: 6, winner: 1, me: null });
    expect(diceStatus(spec, nameFor(null))).toBe("Rolled 6: High. Zoro wins");
    expect(diceSlot(spec, nameFor(null))).toEqual({ kind: "wait", text: "Zoro is choosing…" });
    expect(diceSlot(view({ me: null }), nameFor(null))).toEqual({ kind: "wait", text: "Luffy is calling…" });
    expect(diceSlot(view({ me: null, step: "roll", call: "low" }), nameFor(null))).toEqual({ kind: "wait", text: "Zoro is rolling…" });
  });
});
