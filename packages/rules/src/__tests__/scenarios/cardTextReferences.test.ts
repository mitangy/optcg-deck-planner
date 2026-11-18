import { runScenarios, mine, theirs, type CardScenario } from "../../testing/scenario.js";

const KAROO = "ST01-003";
const ROBIN = "ST01-008";
const ATMOS = "OP02-003";
const SPEED_JIL = "OP03-006";
const COST_6 = "EB01-041";
const COST_5 = "EB01-018";
const SLASH_ATTACKER = "EB01-005";
const STRIKE_ATTACKER = "OP01-010";

const rows: CardScenario[] = [
  {
    card: "ST22-001", name: "puts the revealed card on top of the deck, so the hand is net unchanged (#515)",
    leaders: { me: "ST22-001" },
    me: { hand: [ATMOS, SPEED_JIL, KAROO], deckTop: [ROBIN] },
    steps: [{ activate: mine("ST22-001"), ability: "st22-001#0" }, { pick: [ATMOS] }],
    expect: { me: { hand: [SPEED_JIL, KAROO, ROBIN], deckDelta: 0, deckTop: ATMOS } },
  },

  {
    card: "OP08-096", name: "asks for the Leader or Character to buff when the trashed card costs 6 (#515)",
    me: { hand: ["OP08-096"], don: { active: 1 }, deckTop: [COST_6] },
    opp: { field: [ROBIN] },
    steps: [{ endTurn: true }, { attack: theirs(ROBIN), at: "leader" }, { passBlock: true }, { counter: "OP08-096" }],
    expect: { me: { power: { "ST01-001": 5000 }, trash: [COST_6] }, pending: "select" },
  },
  {
    card: "OP08-096", name: "gives +5000 when the trashed card costs 6 (#515)",
    me: { hand: ["OP08-096"], don: { active: 1 }, deckTop: [COST_6] },
    opp: { field: [ROBIN] },
    steps: [{ endTurn: true }, { attack: theirs(ROBIN), at: "leader" }, { passBlock: true }, { counter: "OP08-096" }, { pick: ["ST01-001"] }],
    expect: { me: { power: { "ST01-001": 10000 }, trash: ["OP08-096", COST_6], deckDelta: -1 } },
  },
  {
    card: "OP08-096", name: "gives nothing when the trashed card costs 5 (#515)",
    me: { hand: ["OP08-096"], don: { active: 1 }, deckTop: [COST_5] },
    opp: { field: [ROBIN] },
    steps: [{ endTurn: true }, { attack: theirs(ROBIN), at: "leader" }, { passBlock: true }, { counter: "OP08-096" }],
    expect: { me: { power: { "ST01-001": 5000 }, trash: ["OP08-096", COST_5], deckDelta: -1 }, pending: "none" },
  },

  {
    card: "OP11-088", name: "gains +5000 when the attacking Character has <Slash> (#515)",
    me: { field: ["OP11-088"] },
    opp: { field: [SLASH_ATTACKER] },
    steps: [{ endTurn: true }, { attack: theirs(SLASH_ATTACKER), at: "leader" }, { accept: true }],
    expect: { me: { power: { "OP11-088": 10000 } } },
  },
  {
    card: "OP11-088", name: "gains nothing when the attacking Character does not have <Slash> (#515)",
    me: { field: ["OP11-088"] },
    opp: { field: [STRIKE_ATTACKER] },
    steps: [{ endTurn: true }, { attack: theirs(STRIKE_ATTACKER), at: "leader" }, { accept: true }],
    expect: { me: { power: { "OP11-088": 5000 } } },
  },
];

runScenarios("card text references (#515)", rows);
