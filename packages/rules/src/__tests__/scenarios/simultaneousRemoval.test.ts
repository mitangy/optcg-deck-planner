/**
 * Replacements that protect "your Characters" cover every Character removed at the same time (#594).
 * One acceptance (and one payment) saves the whole batch (OP17-023 Nami, OP17-095 Zoro Q&A).
 */
import { runScenarios, type CardScenario } from "../../testing/scenario.js";

const ARAMAKI = "OP17-059"; // [On Play] DON!! -1: Draw 1 card and K.O. up to 2 of your opponent's Characters with a cost of 2 or less.
const ALVIDA = "OP03-023"; // vanilla 1-cost {East Blue}
const BLUE = "OP03-052"; // vanilla 1-cost {East Blue}
const NAMI = "OP17-023";
const ZORO = "OP17-095";
const KAROO = "ST01-003";

const rows: CardScenario[] = [
  {
    card: NAMI, name: "one rest saves both Characters K.O.'d at the same time (#594)",
    me: { field: [NAMI, ALVIDA, BLUE] },
    opp: { hand: [ARAMAKI], don: { active: 7 } },
    steps: [{ endTurn: true }, { play: ARAMAKI }, { accept: true }, { pick: ["DON"] }, { pick: [ALVIDA, BLUE] }, { accept: true }],
    expect: { me: { field: [NAMI, ALVIDA, BLUE], rested: [NAMI] }, pending: "none" },
  },
  {
    card: ZORO, name: "places 3 cards once when two Characters would be removed at the same time (#594)",
    me: { field: [ZORO, ALVIDA, BLUE], trash: [KAROO, KAROO, KAROO, KAROO, KAROO, KAROO] },
    opp: { hand: [ARAMAKI], don: { active: 7 } },
    steps: [{ endTurn: true }, { play: ARAMAKI }, { accept: true }, { pick: ["DON"] }, { pick: [ALVIDA, BLUE] }, { accept: true }, { pick: [KAROO, KAROO, KAROO] }],
    expect: { me: { field: [ZORO, ALVIDA, BLUE], trash: [KAROO, KAROO, KAROO] }, pending: "none" },
  },
];

runScenarios("simultaneous removal replacement (#594)", rows);
