/**
 * A replacement covers every cause its text names (#523). Thatch: "If this Character would be removed from the
 * field by your opponent's effect or K.O.'d, trash this Character and draw 1 card instead." Any K.O. (battle, the
 * opponent's effect, your own effect) and any removal by the opponent's effect; not a removal by your own effect.
 */
import { runScenarios, mine, theirs, type CardScenario } from "../../testing/scenario.js";

const THATCH = "OP08-045"; // {Whitebeard Pirates} 4-cost 5000
const KAROO = "ST01-003"; // vanilla 1-cost 3000
const ROBIN = "ST01-008"; // vanilla 3-cost 5000
const HAKUBA = "OP05-087"; // [DON!! x1] [When Attacking] You may K.O. 1 of your Characters other than this Character: ...
const MUGGY_BALL = "OP09-058"; // [Main] Return up to 1 of your opponent's Characters with a cost of 6 or less to the owner's hand.
const JAMBE = "OP02-046"; // [Main] K.O. up to 1 of your opponent's rested Characters with a cost of 4 or less.
const BRICK_FIST = "OP02-067"; // [Main] Return up to 1 Character with a cost of 4 or less to the owner's hand.

const rows: CardScenario[] = [
  {
    card: THATCH, name: "is trashed instead of returned to the hand by the opponent's effect, and you draw 1 card (#523)",
    me: { field: [THATCH], deckTop: [ROBIN] },
    opp: { hand: [MUGGY_BALL], don: { active: 2 } },
    steps: [{ endTurn: true }, { play: MUGGY_BALL }, { pick: [THATCH] }],
    expect: { me: { field: [], trash: [THATCH], hand: [ROBIN] } },
  },
  {
    card: THATCH, name: "is trashed and draws 1 card when your own effect K.O.s it (#523)",
    me: { field: [{ card: HAKUBA, don: 1 }, THATCH], deckTop: [ROBIN] },
    steps: [{ attack: mine(HAKUBA), at: "leader" }, { accept: true }, { passBattle: true }],
    expect: { me: { field: [HAKUBA], trash: [THATCH], hand: [ROBIN] } },
  },
  {
    card: THATCH, name: "is trashed and draws 1 card when the opponent's effect K.O.s it (#523)",
    me: { field: [{ card: THATCH, rested: true }], deckTop: [ROBIN] },
    opp: { hand: [JAMBE], don: { active: 2 } },
    steps: [{ endTurn: true }, { play: JAMBE }, { pick: [THATCH] }],
    expect: { me: { field: [], trash: [THATCH], hand: [ROBIN] } },
  },
  {
    card: THATCH, name: "is trashed and draws 1 card when it is K.O.'d in battle (#523)",
    me: { field: [{ card: THATCH, rested: true }], deckTop: [ROBIN] },
    opp: { field: [ROBIN] },
    steps: [{ endTurn: true }, { attack: theirs(ROBIN), at: mine(THATCH) }, { passBattle: true }],
    expect: { me: { field: [], trash: [THATCH], hand: [ROBIN] } },
  },
  {
    card: THATCH, name: "is returned to the hand as usual by your own effect, without a draw (#523)",
    me: { field: [THATCH], hand: [BRICK_FIST], don: { active: 2 }, deckTop: [ROBIN] },
    steps: [{ play: BRICK_FIST }, { pick: [THATCH] }],
    expect: { me: { field: [], hand: [THATCH], trash: [BRICK_FIST] } },
  },
];

runScenarios("replacement scope (#523)", rows);
