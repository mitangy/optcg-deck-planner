import { runScenarios, theirs, type CardScenario } from "../../testing/scenario.js";

const KAROO = "ST01-003";
const ROBIN = "ST01-008";
const COST_6 = "EB01-041";
const COST_3 = "ST01-008";

const rows: CardScenario[] = [
  {
    card: "EB01-029", name: "puts the revealed cost 6 card at the bottom of the deck and keeps the returned Character in hand (#524)",
    me: { field: [ROBIN], hand: ["EB01-029"], don: { active: 1 }, deckTop: [COST_6] },
    opp: { field: [KAROO] },
    steps: [{ endTurn: true }, { attack: theirs(KAROO), at: "leader" }, { passBlock: true }, { counter: "EB01-029" }, { pick: [ROBIN] }],
    expect: { me: { hand: [ROBIN], field: [], deckDelta: 0, deckBottom: COST_6 }, pending: "none" },
  },
  {
    card: "EB01-029", name: "leaves the revealed cost 3 card on top of the deck and returns no Character (#524)",
    me: { field: [KAROO], hand: ["EB01-029"], don: { active: 1 }, deckTop: [COST_3] },
    opp: { field: [KAROO] },
    steps: [{ endTurn: true }, { attack: theirs(KAROO), at: "leader" }, { passBlock: true }, { counter: "EB01-029" }],
    expect: { me: { hand: [], field: [KAROO], deckDelta: 0, deckTop: COST_3 }, pending: "none" },
  },
];

runScenarios("revealed card binding (#524)", rows);
