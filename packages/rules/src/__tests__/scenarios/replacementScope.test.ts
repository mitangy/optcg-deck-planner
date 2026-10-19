/**
 * A replacement covers every cause its text names (#524). Thatch: "If this Character would be removed from the
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
const LABOON = "EB01-047"; // [Once Per Turn] When a Character is K.O.'d, draw 1 card and trash 1 card from your hand.
const BORSALINO = "OP12-053"; // [Once Per Turn] If this Character would be removed from the field by your opponent's effect, you may trash 1 card from your hand instead.
const GIRL = "P-096"; // {Sabaody Archipelago} 2-cost, [On Play] Draw 1 card and trash 1 card from your hand.
const BRICK_FIST = "OP02-067"; // [Main] Return up to 1 Character with a cost of 4 or less to the owner's hand.

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

  // OP12-040 Kuzan: When a card is trashed from your hand by your {Navy} type card's effect, draw cards equal to the number of cards trashed.
  // OP12-053 Borsalino's replacement trashes a hand card instead of the removal, which counts (OP12-053 Q&A).
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
