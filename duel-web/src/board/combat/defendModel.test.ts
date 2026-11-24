import { describe, expect, it } from "vitest";
import { lookupCard } from "../../cards/atlas";
import { counterValueFor } from "../../cards/counterValue";
import type { Intent, PlayerView } from "../../net/protocol";
import { DEMO_VIEW } from "../fixtures/demoViews";
import { attackSummary, defendVerdict, deriveDefend } from "./defendModel";
import { responseStopPass } from "../settings/gameplayPrefs";
import { stubBattle, stubCard } from "../fixtures/stubCard";

function aceCounterStep(): { view: PlayerView; intents: Intent[] } {
  const view: PlayerView = {
    ...DEMO_VIEW,
    you: {
      ...DEMO_VIEW.you,
      leader: { ...DEMO_VIEW.you.leader, power: 5000, printedPower: 5000 },
      characters: [
        stubCard({ id: "y-ace", defId: "OP16-118", power: 8000, printedPower: 8000, statusLabels: [] }),
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
    battle: stubBattle({ attackerSeat: 1, attackerId: "o-leader", target: { kind: "leader" } }),
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

describe("attack summary above the Pass button (#1343)", () => {
  const base = {
    attackerName: "Nico Robin",
    attackerPower: 4000,
    defenderName: "your Leader",
    defenderPower: 7000,
    blocking: false,
    preview: false,
  };

  it("reads as a sentence with the attacker first and no arrow (#1343)", () => {
    expect(attackSummary(base)).toBe("Nico Robin (4000) attacks your Leader (7000)");
  });

  it("names a previewed Blocker as the one being attacked (#1343)", () => {
    expect(attackSummary({ ...base, defenderName: "Karoo", defenderPower: 3000, blocking: true, preview: true })).toBe(
      "Nico Robin (4000) attacks Blocker Karoo (3000) if it blocks",
    );
  });

  const verdictBase = { phase: "counter" as const, gap: 2000, remaining: 2000, stagedIds: [], stagedTotal: 0, stagedUnknown: false };

  it("says Safe only when no more power is needed (#1343)", () => {
    expect(defendVerdict({ ...verdictBase, gap: 0, remaining: 0 })).toEqual({ text: "Safe", safe: true });
    expect(defendVerdict(verdictBase)).toEqual({ text: "Need +2000 to survive", safe: false });
  });

  it("counts staged counters towards the verdict (#1343)", () => {
    const staged = { ...verdictBase, stagedIds: ["c1"], stagedTotal: 1000 };
    expect(defendVerdict({ ...staged, remaining: 1000 })).toEqual({ text: "+1000 staged · still short by 1000", safe: false });
    expect(defendVerdict({ ...staged, stagedTotal: 2000, remaining: 0 })).toEqual({ text: "+2000 staged · Safe", safe: true });
  });
});
