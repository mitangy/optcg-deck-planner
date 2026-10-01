/**
 * Mandatory On Play / Main / Counter / When Attacking / On K.O. effects, with a
 * row for the case where the printed condition or target filter does not hold.
 */
import { runScenarios, mine, theirs, type CardScenario } from "../../testing/scenario.js";

const KAROO = "ST01-003"; // vanilla 1-cost 3000
const VIVI = "ST01-009"; // vanilla 2-cost 4000
const ROBIN = "ST01-008"; // vanilla 3-cost 5000
const BIG = "EB02-001"; // vanilla 5-cost 7000
const CHOPPER = "ST01-006"; // 1-cost 1000 [Blocker]

const rows: CardScenario[] = [
  // OP02-011 Vista: [On Play] K.O. up to 1 of your opponent's Characters with 3000 power or less.
  {
    card: "OP02-011", name: "K.O.s a Character with 3000 power or less and spares a 4000 one",
    me: { hand: ["OP02-011"], don: { active: 3 } },
    opp: { field: [KAROO, VIVI] },
    steps: [{ play: "OP02-011" }, { pick: [KAROO] }],
    expect: { opp: { field: [VIVI], trash: [KAROO] } },
  },

  {
    card: "OP02-011", name: "leaves a 4000-power Character alone",
    me: { hand: ["OP02-011"], don: { active: 3 } },
    opp: { field: [VIVI] },
    steps: [{ play: "OP02-011" }],
    expect: { opp: { field: [VIVI] }, pending: "none" },
  },

  // OP01-033 Izo: [On Play] Rest up to 1 of your opponent's Characters with a cost of 4 or less.
  {
    card: "OP01-033", name: "rests a Character with cost 4 or less",
    me: { hand: ["OP01-033"], don: { active: 3 } },
    opp: { field: [VIVI, BIG] },
    steps: [{ play: "OP01-033" }, { pick: [VIVI] }],
    expect: { opp: { field: [VIVI, BIG], rested: [VIVI] } },
  },

  {
    card: "OP01-033", name: "leaves a cost 5 Character active",
    me: { hand: ["OP01-033"], don: { active: 3 } },
    opp: { field: [BIG] },
    steps: [{ play: "OP01-033" }],
    expect: { opp: { rested: [] }, pending: "none" },
  },

  // OP01-054 X.Drake: [On Play] K.O. up to 1 of your opponent's rested Characters with a cost of 4 or less.
  {
    card: "OP01-054", name: "K.O.s only a rested Character, leaving an active one",
    me: { hand: ["OP01-054"], don: { active: 5 } },
    opp: { field: [KAROO, { card: VIVI, rested: true }] },
    steps: [{ play: "OP01-054" }, { pick: [VIVI] }],
    expect: { opp: { field: [KAROO], trash: [VIVI] } },
  },

  {
    card: "OP01-054", name: "leaves an active Character alone",
    me: { hand: ["OP01-054"], don: { active: 5 } },
    opp: { field: [KAROO] },
    steps: [{ play: "OP01-054" }],
    expect: { opp: { field: [KAROO] }, pending: "none" },
  },

  // OP01-027 Round Table: [Main] Give up to 1 of your opponent's Characters -10000 power during this turn.
  {
    card: "OP01-027", name: "gives the chosen Character -10000 power",
    me: { hand: ["OP01-027"], don: { active: 4 } },
    opp: { field: [ROBIN, VIVI] },
    steps: [{ play: "OP01-027" }, { pick: [ROBIN] }],
    expect: { opp: { power: { [ROBIN]: -5000, [VIVI]: 4000 } } },
  },
  {
    card: "OP01-027", name: "choosing nobody leaves every power unchanged",
    me: { hand: ["OP01-027"], don: { active: 4 } },
    opp: { field: [ROBIN, VIVI] },
    steps: [{ play: "OP01-027" }, { pick: [] }],
    expect: { opp: { power: { [ROBIN]: 5000, [VIVI]: 4000 } } },
  },

  // OP01-115 Elephant's Marchoo: [Main] K.O. up to 1 of your opponent's Characters with a cost of 2 or less, then add up to 1 DON!! card from your DON!! deck and set it as active.
  {
    card: "OP01-115", name: "K.O.s a cost 2 Character, then adds an active DON!!",
    me: { hand: ["OP01-115"], don: { active: 4 } },
    opp: { field: [VIVI, ROBIN] },
    steps: [{ play: "OP01-115" }, { pick: [VIVI] }],
    expect: { me: { don: { active: 1, deck: 5 } }, opp: { field: [ROBIN] } },
  },
  {
    card: "OP01-115", name: "still adds the DON!! when no Character has cost 2 or less",
    me: { hand: ["OP01-115"], don: { active: 4 } },
    opp: { field: [ROBIN, BIG] },
    steps: [{ play: "OP01-115" }],
    expect: { me: { don: { active: 1, deck: 5 } }, opp: { field: [ROBIN, BIG] }, pending: "none" },
  },

  // OP01-029 Radical Beam!!: [Counter] +2000 power this battle; with 2 or less Life, an additional +2000.
  {
    card: "OP01-029", name: "gives +2000 with 3 Life",
    me: { hand: ["OP01-029"], don: { active: 1 }, life: [KAROO, KAROO, KAROO] },
    opp: { field: [ROBIN] },
    steps: [{ endTurn: true }, { attack: theirs(ROBIN), at: "leader" }, { passBlock: true }, { counter: "OP01-029" }, { pick: ["ST01-001"] }],
    expect: { me: { power: { "ST01-001": 7000 } } },
  },
  {
    card: "OP01-029", name: "gives +4000 with 2 Life",
    me: { hand: ["OP01-029"], don: { active: 1 }, life: [KAROO, KAROO] },
    opp: { field: [ROBIN] },
    steps: [{ endTurn: true }, { attack: theirs(ROBIN), at: "leader" }, { passBlock: true }, { counter: "OP01-029" }, { pick: ["ST01-001"] }],
    expect: { me: { power: { "ST01-001": 9000 } } },
  },

  // ST01-002 Usopp: [DON!! x2] [When Attacking] Your opponent cannot activate a [Blocker] Character that has 5000 or more power during this battle.
  {
    card: "ST01-002", name: "stops a 5000-power Blocker but not a 1000-power one",
    me: { field: [{ card: "ST01-002", don: 2 }] },
    opp: { field: ["OP04-104", CHOPPER] },
    steps: [{ attack: mine("ST01-002"), at: "leader" }],
    expect: { opp: { blockers: [CHOPPER] } },
  },
  {
    card: "ST01-002", name: "without 2 DON!! the 5000-power Blocker can block",
    me: { field: [{ card: "ST01-002", don: 1 }] },
    opp: { field: ["OP04-104", CHOPPER] },
    steps: [{ attack: mine("ST01-002"), at: "leader" }],
    expect: { opp: { blockers: ["OP04-104", CHOPPER] } },
  },

  // OP02-017 Masked Deuce: [DON!! x2] [When Attacking] K.O. up to 1 of your opponent's Characters with 2000 power or less.
  {
    card: "OP02-017", name: "K.O.s a 1000-power Character when attacking with 2 DON!!",
    me: { field: [{ card: "OP02-017", don: 2 }] },
    opp: { field: [CHOPPER, KAROO] },
    steps: [{ attack: mine("OP02-017"), at: "leader" }, { pick: [CHOPPER] }],
    expect: { opp: { field: [KAROO], trash: [CHOPPER] } },
  },
  {
    card: "OP02-017", name: "does nothing with only 1 DON!!",
    me: { field: [{ card: "OP02-017", don: 1 }] },
    opp: { field: [CHOPPER, KAROO] },
    steps: [{ attack: mine("OP02-017"), at: "leader" }],
    expect: { opp: { field: [CHOPPER, KAROO], trash: [] }, pending: "none" },
  },

  {
    card: "OP02-017", name: "leaves a 3000-power Character alone",
    me: { field: [{ card: "OP02-017", don: 2 }] },
    opp: { field: [KAROO] },
    steps: [{ attack: mine("OP02-017"), at: "leader" }],
    expect: { opp: { field: [KAROO] }, pending: "none" },
  },

  // OP01-007 Caribou: [On K.O.] K.O. up to 1 of your opponent's Characters with 4000 power or less.
  {
    card: "OP01-007", name: "when K.O.'d in battle, K.O.s a 3000-power Character but not a 7000 one",
    me: { field: [{ card: "OP01-007", rested: true }] },
    opp: { field: [ROBIN, KAROO, BIG] },
    steps: [{ endTurn: true }, { attack: theirs(ROBIN), at: mine("OP01-007") }, { passBattle: true }, { pick: [KAROO] }],
    expect: { me: { field: [], trash: ["OP01-007"] }, opp: { field: [ROBIN, BIG], trash: [KAROO] } },
  },
  {
    card: "OP01-007", name: "leaves Characters with more than 4000 power alone",
    me: { field: [{ card: "OP01-007", rested: true }] },
    opp: { field: [ROBIN, BIG] },
    steps: [{ endTurn: true }, { attack: theirs(ROBIN), at: mine("OP01-007") }, { passBattle: true }],
    expect: { me: { field: [], trash: ["OP01-007"] }, opp: { field: [ROBIN, BIG] }, pending: "none" },
  },

  // OP16-109 Doc Q: [On K.O.] If your Leader has the {Blackbeard Pirates} type, draw 1 card and K.O. up to 2 of your opponent's Characters with a cost of 1 or less.
  {
    card: "OP16-109", name: "with a Blackbeard Pirates Leader, draws and K.O.s two cost-1 Characters",
    leaders: { me: "OP09-081" },
    me: { field: [{ card: "OP16-109", rested: true }], deckTop: [VIVI] },
    opp: { field: [VIVI, KAROO, CHOPPER, ROBIN] },
    steps: [{ endTurn: true }, { attack: theirs(ROBIN), at: mine("OP16-109") }, { passBattle: true }, { pick: [KAROO, CHOPPER] }],
    expect: { me: { hand: [VIVI], deckDelta: -1 }, opp: { field: [VIVI, ROBIN], trash: [KAROO, CHOPPER] } },
  },
  {
    card: "OP16-109", name: "without a Blackbeard Pirates Leader, does nothing",
    me: { field: [{ card: "OP16-109", rested: true }], deckTop: [VIVI] },
    opp: { field: [VIVI, KAROO, CHOPPER, ROBIN] },
    steps: [{ endTurn: true }, { attack: theirs(ROBIN), at: mine("OP16-109") }, { passBattle: true }],
    expect: { me: { hand: [], deckDelta: 0 }, opp: { field: [VIVI, KAROO, CHOPPER, ROBIN] }, pending: "none" },
  },

  // OP14-108 Silvers Rayleigh: [On Play] If your Leader is multicolored and your opponent has 3 or less Life cards, K.O. up to 1 of your opponent's Characters with 7000 base power or less.
  {
    card: "OP14-108", name: "with a multicolored Leader and opponent at 3 Life, K.O.s a 7000 base power Character",
    leaders: { me: "OP01-061" },
    me: { hand: ["OP14-108"], don: { active: 6 } },
    opp: { field: [BIG, "EB01-041"], life: [KAROO, KAROO, KAROO] },
    steps: [{ play: "OP14-108" }, { pick: [BIG] }],
    expect: { opp: { field: ["EB01-041"], trash: [BIG] } },
  },
  {
    card: "OP14-108", name: "does nothing when the opponent has 4 Life",
    leaders: { me: "OP01-061" },
    me: { hand: ["OP14-108"], don: { active: 6 } },
    opp: { field: [BIG, "EB01-041"], life: [KAROO, KAROO, KAROO, KAROO] },
    steps: [{ play: "OP14-108" }],
    expect: { opp: { field: [BIG, "EB01-041"] }, pending: "none" },
  },
  {
    card: "OP14-108", name: "does nothing with a single-color Leader",
    me: { hand: ["OP14-108"], don: { active: 6 } },
    opp: { field: [BIG, "EB01-041"], life: [KAROO, KAROO, KAROO] },
    steps: [{ play: "OP14-108" }],
    expect: { opp: { field: [BIG, "EB01-041"] }, pending: "none" },
  },

  {
    card: "OP14-108", name: "spares a Character with more than 7000 base power",
    leaders: { me: "OP01-061" },
    me: { hand: ["OP14-108"], don: { active: 6 } },
    opp: { field: ["EB01-041"], life: [KAROO, KAROO, KAROO] },
    steps: [{ play: "OP14-108" }],
    expect: { opp: { field: ["EB01-041"] }, pending: "none" },
  },

  // OP01-005 Uta: [On Play] Add up to 1 red Character card other than [Uta] with a cost of 3 or less from your trash to your hand.
  {
    card: "OP01-005", name: "returns a red Character with cost 3 or less from the trash",
    me: { hand: ["OP01-005"], don: { active: 4 }, trash: [VIVI, BIG, "OP02-060", "OP01-005"] },
    steps: [{ play: "OP01-005" }, { pick: [VIVI] }],
    expect: { me: { hand: [VIVI], trash: [BIG, "OP02-060", "OP01-005"] } },
  },
  {
    card: "OP01-005", name: "leaves a red Character with cost above 3 and a blue one in the trash",
    me: { hand: ["OP01-005"], don: { active: 4 }, trash: [BIG, "OP02-060"] },
    steps: [{ play: "OP01-005" }],
    expect: { me: { hand: [], trash: [BIG, "OP02-060"] }, pending: "none" },
  },
];

runScenarios("effects", rows);
