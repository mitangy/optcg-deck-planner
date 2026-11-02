import { describe, expect, it } from "vitest";
import { powerOf } from "../engine/queries.js";
import { Harness } from "../testing/harness.js";
import type { Intent } from "../types.js";

// Behavior pinned from the 2026-11-02 weekly Stryker run (#859).

describe("legal intents in the counter step", () => {
  const KAROO = "ST01-003"; // vanilla 1-cost, Counter 1000
  const CHOPPER = "ST01-006"; // 1-cost Character with no Counter value
  const REPEL = "ST02-016"; // 2-cost Event. [Counter] Up to 1 of your Leader or Character cards gains +4000 power during this battle. Then, set up to 1 of your DON!! cards as active.
  const NEW_GENESIS = "ST11-004"; // 1-cost Event with only a [Main] effect, no [Counter]

  /** Seat 1 holds [Karoo, Chopper, Repel, New Genesis] with the given DON!! while seat 0 attacks the Leader. */
  function counterStep(active: number, rested = 0): { intents: Intent[]; hand: string[] } {
    const h = new Harness();
    h.hand(1, KAROO, CHOPPER, REPEL, NEW_GENESIS);
    h.don(1, active, rested);
    h.attack(h.state.players[0].leader, "leader");
    h.act(1, { type: "pass_block" });
    expect(h.state.phase).toBe("counter");
    return { intents: h.legal(1), hand: h.state.players[1].hand.map((c) => c.defId) };
  }

  it("offers a Counter Event when the active DON!! exactly cover its cost (#861)", () => {
    const { intents, hand } = counterStep(2);
    expect(intents.filter((i) => i.type === "counter_event")).toEqual([{ type: "counter_event", handIndex: hand.indexOf(REPEL) }]);
  });

  it("does not offer a Counter Event when the active DON!! are one short of its cost, however many are rested (#861)", () => {
    const { intents } = counterStep(1, 5);
    expect(intents.filter((i) => i.type === "counter_event")).toEqual([]);
  });

  it("offers only Characters with a Counter value as counters, and never an Event without a [Counter] (#861)", () => {
    const { intents, hand } = counterStep(10);
    expect(intents.filter((i) => i.type === "counter_from_hand")).toEqual([{ type: "counter_from_hand", handIndex: hand.indexOf(KAROO) }]);
    expect(intents.filter((i) => i.type === "counter_event")).toEqual([{ type: "counter_event", handIndex: hand.indexOf(REPEL) }]);
  });
});

describe("a negated Character's own static abilities", () => {
  const SANJI = "OP12-070"; // 3-cost 5000. This Character gains +1000 power for every 5 Events in your trash.
  const ROGER = "OP13-064"; // Your Leader and all of your Characters that do not have a type including "Roger Pirates" have their effects negated.
  const GUARD_POINT = "ST01-014"; // Event

  function sanjiPower(withRoger: boolean): number {
    const h = new Harness();
    const [sanji] = h.field(0, SANJI);
    if (withRoger) h.field(0, ROGER);
    h.trash(0, ...Array<string>(5).fill(GUARD_POINT));
    return powerOf(h.state, 0, sanji!);
  }

  it("keep applying while the Character is not negated and stop once it is (#861)", () => {
    expect(sanjiPower(false)).toBe(6000);
    expect(sanjiPower(true)).toBe(5000);
  });
});
