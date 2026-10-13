/**
 * Using an Event's [Main] effect from the trash is not "activating an Event" (#594, EB03-031 Reiju / OP15-119 Luffy Q&A).
 */
import { runScenarios, type CardScenario } from "../../testing/scenario.js";

const REIJU = "EB03-031"; // [Your Turn] [On Play] DON!! -1: If your Leader is [Sanji], activate the [Main] effect of up to 1 Event in your trash.
const SANJI = "OP02-026";
const PILAF = "OP03-056"; // [Main] Draw 2 cards.
const LUFFY = "OP15-119"; // When your opponent activates an Event or [Blocker], reveal a Life card: +1000 power per cost.
const ROBIN = "ST01-008"; // 3-cost

const rows: CardScenario[] = [
  {
    card: LUFFY, name: "does not power up when the opponent uses an Event's [Main] from the trash with Reiju (#594)",
    leaders: { me: SANJI },
    me: { hand: [REIJU], trash: [PILAF], don: { active: 6 } },
    opp: { field: [LUFFY], life: [ROBIN] },
    steps: [{ play: REIJU }, { accept: true }, { pick: ["DON"] }, { pick: [PILAF] }],
    expect: { opp: { power: { [LUFFY]: 7000 } } },
  },
  {
    card: LUFFY, name: "powers up per cost on the revealed Life card when the opponent plays an Event from hand (#594)",
    me: { field: [LUFFY], life: [ROBIN] },
    opp: { hand: [PILAF], don: { active: 3 } },
    steps: [{ endTurn: true }, { play: PILAF }],
    expect: { me: { power: { [LUFFY]: 10000 } } },
  },
];

runScenarios("event activation source (#594)", rows);
