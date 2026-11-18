import { runScenarios, type CardScenario } from "../../testing/scenario.js";

const ARAMAKI = "OP17-059";
const ALVIDA = "OP03-023";
const BLUE = "OP03-052";
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

const BEGE = "OP11-101";
const DEMON_FACE = "OP01-056";
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
