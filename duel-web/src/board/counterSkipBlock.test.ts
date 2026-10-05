import { describe, expect, it } from "vitest";
import type { Intent, PlayerView } from "../net/protocol";
import { DEMO_VIEW } from "../pages/DemoPage";
import { counterAfterBlock, followUpCounter } from "./counterSkipBlock";
import { deriveDefend } from "./defendModel";
import { parseDropAttr, resolveDropIntents } from "./dragIntents";

// ST01-003 Karoo prints +1000; ST01-006 Chopper has no Counter;
// ST01-014 Guard Point is a 1-cost [Counter] Event; ST01-016 Diable Jambe has no [Counter].
const blockStep: Intent[] = [
  { type: "pass_block" },
  { type: "declare_block", blockerId: "y-c1" },
];

describe("skip the block by dragging a Counter (#NNN)", () => {
  it("drops a Counter on the defender in the block step as a pass_block", () => {
    const sent = resolveDropIntents(
      { type: "counter", handIndex: 0 },
      parseDropAttr("counter:y-leader"),
      blockStep,
      { defenderId: "y-leader" },
    );
    expect(sent).toEqual([{ type: "pass_block" }]);
    // Anywhere but the defender still does nothing.
    expect(
      resolveDropIntents({ type: "counter", handIndex: 0 }, parseDropAttr("counter:y-c1"), blockStep, {
        defenderId: "y-leader",
      }),
    ).toEqual([]);
  });

  it("does not pass anything for a counter-step drop the step does not list", () => {
    const counterStep: Intent[] = [{ type: "pass_counter" }, { type: "counter_from_hand", handIndex: 1 }];
    expect(
      resolveDropIntents({ type: "counter", handIndex: 0 }, parseDropAttr("counter:y-leader"), counterStep, {
        defenderId: "y-leader",
      }),
    ).toEqual([]);
  });

  it("only offers cards the counter step will take: a Counter above 0, or an affordable [Counter] Event", () => {
    expect(counterAfterBlock({ id: "a", defId: "ST01-003" }, 0)).toBe(true);
    expect(counterAfterBlock({ id: "b", defId: "ST01-006" }, 5)).toBe(false);
    // The engine's live Counter wins over the printed one, both ways.
    expect(counterAfterBlock({ id: "a", defId: "ST01-003", counter: 0 }, 0)).toBe(false);
    expect(counterAfterBlock({ id: "b", defId: "ST01-006", counter: 1000 }, 0)).toBe(true);
    expect(counterAfterBlock({ id: "c", defId: "ST01-014" }, 1)).toBe(true);
    expect(counterAfterBlock({ id: "c", defId: "ST01-014" }, 0)).toBe(false);
    expect(counterAfterBlock({ id: "d", defId: "ST01-016" }, 5)).toBe(false);
  });

  it("waits out the block step, then plays the dragged card by id in the counter step", () => {
    const hand = [
      { id: "y-h1", defId: "ST01-006" },
      { id: "y-h2", defId: "ST01-003" },
    ];
    expect(followUpCounter(blockStep, hand, "y-h2")).toEqual({ settled: false, intent: null });
    const counterStep: Intent[] = [
      { type: "pass_counter" },
      { type: "counter_from_hand", handIndex: 0 },
      { type: "counter_from_hand", handIndex: 1 },
    ];
    expect(followUpCounter(counterStep, hand, "y-h2")).toEqual({
      settled: true,
      intent: { type: "counter_from_hand", handIndex: 1 },
    });
  });

  it("drops the queued Counter when the counter step does not list it", () => {
    const hand = [
      { id: "y-h1", defId: "ST01-003" },
      { id: "y-h2", defId: "ST01-003" },
    ];
    const counterStep: Intent[] = [{ type: "pass_counter" }, { type: "counter_from_hand", handIndex: 1 }];
    // Another card's counter is legal, but never the one the player dragged.
    expect(followUpCounter(counterStep, hand, "y-h1")).toEqual({ settled: true, intent: null });
  });

  it("lists skip-block Counter chips in the block step only", () => {
    const view: PlayerView = {
      ...DEMO_VIEW,
      you: {
        ...DEMO_VIEW.you,
        activeDonCount: 1,
        hand: [
          { id: "y-h1", defId: "ST01-003" },
          { id: "y-h2", defId: "ST01-006" },
          { id: "y-h3", defId: "ST01-014" },
        ],
      },
      battle: { attackerSeat: 1, attackerId: "o-c1", target: { kind: "leader" } },
    };
    const block = deriveDefend(view, blockStep, { counterIds: [], blockerId: null })!;
    expect(block.earlyCounters.map((c) => [c.id, c.label])).toEqual([
      ["y-h1", "+1000"],
      ["y-h3", "+3000"],
    ]);
    const counter = deriveDefend(view, [{ type: "pass_counter" }], { counterIds: [], blockerId: null })!;
    expect(counter.earlyCounters).toEqual([]);
  });
});
