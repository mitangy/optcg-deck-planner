import { describe, expect, it } from "vitest";
import { FILLER, Harness } from "../../testing/harness.js";
import { runScenarios, mine, type CardScenario } from "../../testing/scenario.js";

const KAROO = "ST01-003";
const VIVI = "ST01-009";
const KOMACHIYO = "OP01-010";
const SPEED = "OP01-104";
const HAMLET = "OP08-090";
const ANIMAL_CHOPPER = "OP04-010";

const rows: CardScenario[] = [
  {
    card: "OP18-001", name: "powers and grants Rush only to Characters with both {Animal} and {Alabasta} (#577)",
    leaders: { me: "OP18-001" },
    me: { field: [KAROO, VIVI, KOMACHIYO] },
    expect: {
      me: {
        power: { [KAROO]: 4000, [VIVI]: 4000, [KOMACHIYO]: 3000 },
        keywords: { [KAROO]: ["rush"], [VIVI]: [], [KOMACHIYO]: [] },
      },
    },
  },

  {
    card: "OP18-060", name: "draws 2 and trashes 1 when a Character is played from your trash (#577)",
    leaders: { me: "OP18-060" },
    me: { hand: [HAMLET], trash: [SPEED], don: { active: 3 } },
    steps: [{ play: HAMLET }, { pick: [SPEED] }, { pick: [FILLER] }],
    expect: { me: { hand: [FILLER], field: [HAMLET, SPEED], trash: [FILLER] } },
  },
  {
    card: "OP18-060", name: "does nothing when the Character is played from the hand (#577)",
    leaders: { me: "OP18-060" },
    me: { hand: [ANIMAL_CHOPPER, KAROO], don: { active: 3 } },
    steps: [{ play: ANIMAL_CHOPPER }, { pick: [KAROO] }],
    expect: { me: { hand: [], field: [ANIMAL_CHOPPER, KAROO], trash: [] }, pending: "none" },
  },

  {
    card: "OP18-076", name: "gives a 5000 power Leader and the chosen Characters +1000 (#577)",
    opp: { stage: "OP18-076", field: [KAROO, VIVI, KOMACHIYO] },
    steps: [{ attack: mine("ST01-001"), at: "leader" }, { accept: true }, { pick: [KAROO, VIVI] }],
    expect: { opp: { power: { "ST01-001": 6000, [KAROO]: 4000, [VIVI]: 5000, [KOMACHIYO]: 3000 } } },
  },
  {
    card: "OP18-076", name: "leaves a Leader above 5000 power alone but still powers the Characters (#577)",
    leaders: { opp: "OP02-001" },
    opp: { stage: "OP18-076", field: [KAROO] },
    steps: [{ attack: mine("ST01-001"), at: "leader" }, { accept: true }, { pick: [KAROO] }],
    expect: { opp: { power: { "OP02-001": 6000, [KAROO]: 4000 } } },
  },

  {
    card: "OP16-079", name: "the Character played from the trash gains Rush, not whatever the effect last touched (#577)",
    leaders: { me: "OP16-079" },
    me: { hand: ["OP16-099"], trash: [KOMACHIYO], don: { active: 7 } },
    steps: [{ play: "OP16-099" }, { accept: true }, { pick: [KOMACHIYO] }],
    expect: { me: { field: [KOMACHIYO], keywords: { [KOMACHIYO]: ["rush"] } } },
  },
];

runScenarios("OP18 import scenarios (#577)", rows);

describe("OP18-022 Monkey.D.Luffy", () => {
  const firstAttack = (accept: boolean): Harness => {
    const h = new Harness({ leaders: ["OP18-022", "ST01-001"] });
    h.attach(0, h.state.players[0].leader, 3);
    h.attack(h.state.players[0].leader, "leader");
    if (accept) h.accept(); else h.decline();
    h.passBattle();
    return h;
  };
  const leaderRested = (h: Harness) => h.state.players[0].leader.rested;

  it("setting the Leader active (and attacking again) keeps it rested through the next Refresh Phase (#577)", () => {
    const h = firstAttack(true);
    expect(leaderRested(h)).toBe(false);
    h.attack(h.state.players[0].leader, "leader");
    h.passBattle();
    expect(leaderRested(h)).toBe(true);
    h.act(0, { type: "end_turn" });
    h.act(1, { type: "end_turn" });
    expect(h.state.activeSeat).toBe(0);
    expect(leaderRested(h)).toBe(true);
  });

  it("declining leaves the Leader rested and refreshes it normally (#577)", () => {
    const h = firstAttack(false);
    expect(leaderRested(h)).toBe(true);
    h.act(0, { type: "end_turn" });
    h.act(1, { type: "end_turn" });
    expect(leaderRested(h)).toBe(false);
  });
});
