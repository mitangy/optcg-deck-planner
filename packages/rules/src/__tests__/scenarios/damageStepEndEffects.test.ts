/**
 * "When your number of Life cards becomes 0" waits for the end of the Damage Step (#594, OP05-098 Enel Q&A):
 * a Double Attack's second damage is dealt first, then the Leader's effect refills the Life.
 */
import { runScenarios, mine, type CardScenario } from "../../testing/scenario.js";

const ENEL = "OP05-098";
const ACE = "P-028"; // [Double Attack]
const KAROO = "ST01-003";
const ROBIN = "ST01-008";
const ALVIDA = "OP03-023";

const rows: CardScenario[] = [
  {
    card: ENEL, name: "refills Life only after a Double Attack's 2 damage, ending at 1 Life (#594)",
    leaders: { opp: ENEL },
    me: { field: [ACE] },
    opp: { life: [KAROO], hand: [ROBIN], deckTop: [ALVIDA] },
    steps: [{ attack: mine(ACE), at: "leader" }, { passBattle: true }, { pick: [ROBIN] }],
    expect: { opp: { life: [ALVIDA], hand: [KAROO], trash: [ROBIN] }, pending: "none" },
  },
];

runScenarios("damage step end effects (#594)", rows);
