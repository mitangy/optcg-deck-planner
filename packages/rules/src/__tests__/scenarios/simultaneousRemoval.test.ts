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

const BEGE = "OP11-101"; // [Once Per Turn] a Supernovas Character would be removed by an opponent's effect: add it to the top of your Life face-down instead.
const DEMON_FACE = "OP01-056"; // [Main] K.O. up to 2 of your opponent's rested Characters with a cost of 5 or less.
const SUPERNOVA_A = "OP02-043";
const SUPERNOVA_B = "OP14-008";

runScenarios("Bege's replacement acts on one Character (#593)", [
  {
    card: BEGE, name: "replacement saves only the Character it was used for (#593)",
    me: { field: [BEGE, { card: SUPERNOVA_A, rested: true }, { card: SUPERNOVA_B, rested: true }], life: ["ST01-003"] },
    opp: { hand: [DEMON_FACE], don: { active: 6 } },
    steps: [{ endTurn: true }, { play: DEMON_FACE }, { pick: [SUPERNOVA_A, SUPERNOVA_B] }, { accept: true }],
    expect: { me: { field: [BEGE], life: 2 }, pending: "none" },
  },
]);
