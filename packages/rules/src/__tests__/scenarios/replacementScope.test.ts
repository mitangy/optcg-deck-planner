import { runScenarios, mine, theirs, type CardScenario } from "../../testing/scenario.js";

const THATCH = "OP08-045";
const KAROO = "ST01-003";
const ROBIN = "ST01-008";
const HAKUBA = "OP05-087";
const MUGGY_BALL = "OP09-058";
const JAMBE = "OP02-046";
const LABOON = "EB01-047";
const BORSALINO = "OP12-053";
const GIRL = "P-096";
const BRICK_FIST = "OP02-067";

const rows: CardScenario[] = [
  {
    card: THATCH, name: "is trashed instead of returned to the hand by the opponent's effect, and you draw 1 card (#524)",
    me: { field: [THATCH], deckTop: [ROBIN] },
    opp: { hand: [MUGGY_BALL], don: { active: 2 } },
    steps: [{ endTurn: true }, { play: MUGGY_BALL }, { pick: [THATCH] }],
    expect: { me: { field: [], trash: [THATCH], hand: [ROBIN] } },
  },
  {
    card: THATCH, name: "is trashed and draws 1 card when your own effect K.O.s it (#524)",
    me: { field: [{ card: HAKUBA, don: 1 }, THATCH], deckTop: [ROBIN] },
    steps: [{ attack: mine(HAKUBA), at: "leader" }, { accept: true }, { passBattle: true }],
    expect: { me: { field: [HAKUBA], trash: [THATCH], hand: [ROBIN] } },
  },
  {
    card: THATCH, name: "is trashed and draws 1 card when the opponent's effect K.O.s it (#524)",
    me: { field: [{ card: THATCH, rested: true }], deckTop: [ROBIN] },
    opp: { hand: [JAMBE], don: { active: 2 } },
    steps: [{ endTurn: true }, { play: JAMBE }, { pick: [THATCH] }],
    expect: { me: { field: [], trash: [THATCH], hand: [ROBIN] } },
  },
  {
    card: THATCH, name: "is trashed and draws 1 card when it is K.O.'d in battle (#524)",
    me: { field: [{ card: THATCH, rested: true }], deckTop: [ROBIN] },
    opp: { field: [ROBIN] },
    steps: [{ endTurn: true }, { attack: theirs(ROBIN), at: mine(THATCH) }, { passBattle: true }],
    expect: { me: { field: [], trash: [THATCH], hand: [ROBIN] } },
  },
  {
    card: THATCH, name: "is returned to the hand as usual by your own effect, without a draw (#524)",
    me: { field: [THATCH], hand: [BRICK_FIST], don: { active: 2 }, deckTop: [ROBIN] },
    steps: [{ play: BRICK_FIST }, { pick: [THATCH] }],
    expect: { me: { field: [], hand: [THATCH], trash: [BRICK_FIST] } },
  },

  // A replaced K.O. is not a K.O. (OP08-045 Q&A): "When a Character is K.O.'d" does not trigger.
  {
    card: "EB01-047", name: "triggers when a Character is K.O.'d in battle (#524)",
    me: { field: [{ card: KAROO, rested: true }, LABOON], deckTop: [ROBIN] },
    opp: { field: [ROBIN] },
    steps: [{ endTurn: true }, { attack: theirs(ROBIN), at: mine(KAROO) }, { passBattle: true }],
    expect: { me: { hand: [], trash: [KAROO, ROBIN] }, pending: "none" },
  },
  {
    card: "EB01-047", name: "does not trigger when Thatch is trashed instead of being K.O.'d (#524)",
    me: { field: [{ card: THATCH, rested: true }, LABOON], deckTop: [ROBIN] },
    opp: { field: [ROBIN] },
    steps: [{ endTurn: true }, { attack: theirs(ROBIN), at: mine(THATCH) }, { passBattle: true }],
    expect: { me: { hand: [ROBIN], trash: [THATCH] }, pending: "none" },
  },

  // OP12-053 Q&A: Borsalino's replacement trash counts for Kuzan.
  {
    card: "OP12-040", name: "draws when Borsalino trashes a card from your hand instead of being removed (#524)",
    leaders: { me: "OP12-040" },
    me: { field: [BORSALINO], hand: [ROBIN], deckTop: [KAROO] },
    opp: { hand: [MUGGY_BALL], don: { active: 2 } },
    steps: [{ endTurn: true }, { play: MUGGY_BALL }, { pick: [BORSALINO] }, { accept: true }],
    expect: { me: { field: [BORSALINO], trash: [ROBIN], hand: [KAROO] }, pending: "none" },
  },
  {
    card: "OP12-040", name: "does not draw when a card that is not {Navy} trashes a card from your hand (#524)",
    leaders: { me: "OP12-040" },
    me: { hand: [GIRL, ROBIN], don: { active: 2 }, deckTop: [KAROO] },
    steps: [{ play: GIRL }, { pick: [ROBIN] }],
    expect: { me: { trash: [ROBIN], hand: [KAROO] }, pending: "none" },
  },
];

runScenarios("replacement scope (#524)", rows);
