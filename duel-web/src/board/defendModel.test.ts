import { describe, expect, it } from "vitest";
import { lookupCard } from "../cards/atlas";
import { counterValueFor } from "../cards/counterValue";
import type { Intent, PlayerView } from "../net/protocol";
import { DEMO_VIEW } from "../pages/DemoPage";
import { deriveDefend } from "./defendModel";
import { responseStopPass } from "./gameplayPrefs";

// OP16-118 Portgas.D.Ace on your field sets the Counter of 8000-power
// Characters in your hand to +2000; OP16-005 Thatch prints +1000.
function aceCounterStep(): { view: PlayerView; intents: Intent[] } {
  const view: PlayerView = {
    ...DEMO_VIEW,
    you: {
      ...DEMO_VIEW.you,
      leader: { ...DEMO_VIEW.you.leader, power: 5000, printedPower: 5000 },
      characters: [
        { id: "y-ace", defId: "OP16-118", power: 8000, printedPower: 8000, statusLabels: [] },
      ],
      hand: [
        { id: "y-t1", defId: "OP16-005", counter: 2000 },
        { id: "y-t2", defId: "OP16-005", counter: 2000 },
      ],
    },
    opponent: {
      ...DEMO_VIEW.opponent,
      leader: { ...DEMO_VIEW.opponent.leader, power: 7000 },
    },
    battle: { attackerSeat: 1, attackerId: "o-leader", target: { kind: "leader" } },
  };
  const intents: Intent[] = [
    { type: "pass_counter" },
    { type: "counter_from_hand", handIndex: 0 },
    { type: "counter_from_hand", handIndex: 1 },
  ];
  return { view, intents };
}

describe("deriveDefend with live Counter statics", () => {
  it("uses the engine's live hand Counter over the printed one", () => {
    expect(counterValueFor(lookupCard("OP16-005"))?.base).toBe(1000);
    const { view, intents } = aceCounterStep();
    const d = deriveDefend(view, intents, { counterIds: [], blockerId: null })!;
    expect(d.counters.map((c) => c.value)).toEqual([2000, 2000]);
    const staged = deriveDefend(view, intents, { counterIds: ["y-t1"], blockerId: null })!;
    expect(staged.stagedTotal).toBe(2000);
  });

  it("does not auto-pass in smart mode when the live Counters close the gap", () => {
    const { view, intents } = aceCounterStep();
    const d = deriveDefend(view, intents, { counterIds: [], blockerId: null })!;
    expect(d.gap).toBe(3000);
    const outlook = { gap: d.gap, values: d.counters.map((c) => c.value) };
    expect(responseStopPass("smart", intents, outlook)).toBeNull();
  });
});
