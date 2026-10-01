/**
 * Leaders, continuous effects, Activate:Main abilities and manually
 * overridden cards. Static rows come in pairs: condition met, condition not met.
 */
import { runScenarios, mine, theirs, type CardScenario } from "../../testing/scenario.js";

const KAROO = "ST01-003"; // vanilla 1-cost 3000, red
const VIVI = "ST01-009"; // vanilla 2-cost 4000, red
const ROBIN = "ST01-008"; // vanilla 3-cost 5000
const KOMACHIYO = "OP01-010"; // vanilla 1-cost, {Land of Wano}
const MOHJI = "OP02-060"; // vanilla 1-cost 3000, blue
const CHOPPER = "ST01-006"; // {Straw Hat Crew}
const trash8 = Array.from({ length: 8 }, () => KAROO);

const rows: CardScenario[] = [
  // OP01-031 Kouzuki Oden: [Activate: Main] [Once Per Turn] You can trash 1 {Land of Wano} card from your hand: Set up to 2 of your DON!! cards as active.
  {
    card: "OP01-031", name: "trashes a Land of Wano card and sets 2 DON!! active",
    leaders: { me: "OP01-031" },
    me: { hand: [KOMACHIYO, KAROO], don: { active: 0, rested: 3 } },
    steps: [{ activate: mine("OP01-031"), ability: "op01-031#0" }],
    expect: { me: { hand: [KAROO], trash: [KOMACHIYO], don: { active: 2, rested: 1 } } },
  },
  {
    card: "OP01-031", name: "cannot activate without a Land of Wano card in hand",
    leaders: { me: "OP01-031" },
    me: { hand: [KAROO], don: { active: 0, rested: 3 } },
    steps: [{ activate: mine("OP01-031"), ability: "op01-031#0", rejects: true }],
    expect: { me: { hand: [KAROO], trash: [], don: { active: 0, rested: 3 } } },
  },
  {
    card: "OP01-031", name: "activates only once per turn",
    leaders: { me: "OP01-031" },
    me: { hand: [KOMACHIYO, "OP01-036"], don: { active: 0, rested: 4 } },
    steps: [{ activate: mine("OP01-031"), ability: "op01-031#0" }, { pick: [KOMACHIYO] }, { activate: mine("OP01-031"), ability: "op01-031#0", rejects: true }],
    expect: { me: { hand: ["OP01-036"], don: { active: 2, rested: 2 } } },
  },

  // OP02-049 Emporio.Ivankov: [End of Your Turn] If you have 0 cards in your hand, draw 2 cards.
  {
    card: "OP02-049", name: "draws 2 at end of turn with an empty hand",
    leaders: { me: "OP02-049" },
    me: { hand: [], deckTop: [VIVI, ROBIN] },
    steps: [{ endTurn: true }],
    expect: { me: { hand: [VIVI, ROBIN], deckDelta: -2 } },
  },
  {
    card: "OP02-049", name: "does not draw at end of turn with a card in hand",
    leaders: { me: "OP02-049" },
    me: { hand: [KAROO], deckTop: [VIVI, ROBIN] },
    steps: [{ endTurn: true }],
    expect: { me: { hand: [KAROO], deckDelta: 0 } },
  },

  // OP02-001 Edward.Newgate: [End of Your Turn] Add 1 card from the top of your Life cards to your hand.
  {
    card: "OP02-001", name: "adds the top Life card to hand at end of turn",
    leaders: { me: "OP02-001" },
    me: { hand: [], life: [VIVI, KAROO, KAROO] },
    steps: [{ endTurn: true }],
    expect: { me: { hand: [VIVI], life: [KAROO, KAROO] } },
  },

  // OP01-061 Kaido: [DON!! x1] [Your Turn] [Once Per Turn] When your opponent's Character is K.O.'d, add up to 1 DON!! card from your DON!! deck and set it as active.
  {
    card: "OP01-061", name: "adds an active DON!! when an opposing Character is K.O.'d",
    leaders: { me: "OP01-061" },
    me: { field: [VIVI], don: { active: 0 }, leaderDon: 1 },
    opp: { field: [{ card: KAROO, rested: true }] },
    steps: [{ attack: mine(VIVI), at: theirs(KAROO) }, { passBattle: true }],
    expect: { opp: { field: [], trash: [KAROO] }, me: { don: { active: 1, deck: 8 } } },
  },
  {
    card: "OP01-061", name: "adds nothing without DON!! attached to the Leader",
    leaders: { me: "OP01-061" },
    me: { field: [VIVI], don: { active: 0 } },
    opp: { field: [{ card: KAROO, rested: true }] },
    steps: [{ attack: mine(VIVI), at: theirs(KAROO) }, { passBattle: true }],
    expect: { opp: { field: [], trash: [KAROO] }, me: { don: { active: 0, deck: 10 } } },
  },
  {
    card: "OP01-061", name: "triggers only once per turn",
    leaders: { me: "OP01-061" },
    me: { field: [VIVI, ROBIN], don: { active: 0 }, leaderDon: 1 },
    opp: { field: [{ card: KAROO, rested: true }, { card: CHOPPER, rested: true }] },
    steps: [{ attack: mine(VIVI), at: theirs(KAROO) }, { passBattle: true }, { attack: mine(ROBIN), at: theirs(CHOPPER) }, { passBattle: true }],
    expect: { opp: { field: [] }, me: { don: { active: 1, deck: 8 } } },
  },

  // OP01-091 King: [Your Turn] If you have 10 DON!! cards on your field, give all of your opponent's Characters -1000 power.
  {
    card: "OP01-091", name: "gives opposing Characters -1000 power with 10 DON!!",
    leaders: { me: "OP01-091" },
    me: { don: { active: 10 } },
    opp: { field: [KAROO, VIVI] },
    expect: { opp: { power: { [KAROO]: 2000, [VIVI]: 3000 } } },
  },
  {
    card: "OP01-091", name: "gives no power change with 9 DON!!",
    leaders: { me: "OP01-091" },
    me: { don: { active: 9 } },
    opp: { field: [KAROO, VIVI] },
    expect: { opp: { power: { [KAROO]: 3000, [VIVI]: 4000 } } },
  },

  // OP01-072 Smiley: [DON!! x1] [Your Turn] This Character gains +1000 power for every card in your hand.
  {
    card: "OP01-072", name: "gains +1000 per hand card with 1 DON!! attached",
    me: { hand: [KAROO, KAROO, KAROO], field: [{ card: "OP01-072", don: 1 }] },
    expect: { me: { power: { "OP01-072": 5000 } } },
  },
  {
    card: "OP01-072", name: "gains nothing without DON!! attached",
    me: { hand: [KAROO, KAROO, KAROO], field: ["OP01-072"] },
    expect: { me: { power: { "OP01-072": 1000 } } },
  },

  // OP01-021 Franky: [DON!! x1] This Character can also attack your opponent's active Characters.
  {
    card: "OP01-021", name: "with 1 DON!! attacks an active Character",
    me: { field: [{ card: "OP01-021", don: 1 }] },
    opp: { field: [KAROO] },
    steps: [{ attack: mine("OP01-021"), at: theirs(KAROO) }, { passBattle: true }],
    expect: { opp: { field: [], trash: [KAROO] } },
  },
  {
    card: "OP01-021", name: "without DON!! cannot attack an active Character",
    me: { field: ["OP01-021"] },
    opp: { field: [KAROO] },
    steps: [{ attack: mine("OP01-021"), at: theirs(KAROO), rejects: true }],
    expect: { opp: { field: [KAROO] } },
  },

  // OP01-068 Gecko Moria: [Your Turn] This Character gains [Double Attack] if you have 5 or more cards in your hand.
  {
    card: "OP01-068", name: "has Double Attack with 5 cards in hand",
    me: { hand: [KAROO, KAROO, KAROO, KAROO, KAROO], field: ["OP01-068"] },
    expect: { me: { keywords: { "OP01-068": ["double_attack"] } } },
  },
  {
    card: "OP01-068", name: "has no Double Attack with 4 cards in hand",
    me: { hand: [KAROO, KAROO, KAROO, KAROO], field: ["OP01-068"] },
    expect: { me: { keywords: { "OP01-068": [] } } },
  },

  // OP09-086 Jesus Burgess: cannot be K.O.'d by your opponent's effects; with a {Blackbeard Pirates} Leader, +1000 power for every 4 cards in your trash.
  {
    card: "OP09-086", name: "survives an opposing K.O. effect",
    me: { hand: ["OP01-054"], don: { active: 5 } },
    opp: { field: [{ card: "OP09-086", rested: true }] },
    steps: [{ play: "OP01-054" }, { pick: ["OP09-086"] }],
    expect: { opp: { field: ["OP09-086"], trash: [] } },
  },
  {
    card: "OP09-086", name: "with a Blackbeard Pirates Leader gains +2000 from 8 trash cards",
    leaders: { me: "OP09-081" },
    me: { field: ["OP09-086"], trash: trash8 },
    expect: { me: { power: { "OP09-086": 7000 } } },
  },
  {
    card: "OP09-086", name: "with another Leader gains no power from the trash",
    me: { field: ["OP09-086"], trash: trash8 },
    expect: { me: { power: { "OP09-086": 5000 } } },
  },

  // EB01-020 Chambres (manual): [Main] If your Leader has the {Supernovas} type, return 1 of your Characters to the owner's hand, and play up to 1 Character card with a cost of 2 or less from your hand that is a different color than the returned Character.
  {
    card: "EB01-020", name: "returns a red Character and plays a blue one, not a red one",
    me: { hand: ["EB01-020", VIVI, MOHJI], don: { active: 1 }, field: [KAROO] },
    steps: [{ play: "EB01-020" }, { pick: [MOHJI] }],
    expect: { me: { field: [MOHJI], hand: [KAROO, VIVI] } },
  },
  {
    card: "EB01-020", name: "does not play a Character of the returned color",
    me: { hand: ["EB01-020", VIVI], don: { active: 1 }, field: [KAROO] },
    steps: [{ play: "EB01-020" }],
    expect: { me: { field: [], hand: [KAROO, VIVI] }, pending: "none" },
  },
  {
    card: "EB01-020", name: "does nothing without a Supernovas Leader",
    leaders: { me: "OP02-049" },
    me: { hand: ["EB01-020", VIVI, MOHJI], don: { active: 1 }, field: [KAROO] },
    steps: [{ play: "EB01-020" }],
    expect: { me: { field: [KAROO], hand: [VIVI, MOHJI] }, pending: "none" },
  },

  // EB01-030 Loguetown (manual): [Activate: Main] You may place this card and 1 card from your hand at the bottom of your deck in any order: Draw 2 cards.
  {
    card: "EB01-030", name: "places itself and a hand card at the deck bottom, then draws 2",
    me: { stage: "EB01-030", hand: [KAROO], deckTop: [VIVI, ROBIN] },
    steps: [{ activate: mine("EB01-030"), ability: "eb01-030#m0" }],
    expect: { me: { stage: null, hand: [VIVI, ROBIN], deckDelta: 0 } },
  },
  {
    card: "EB01-030", name: "cannot activate with an empty hand",
    me: { stage: "EB01-030", hand: [], deckTop: [VIVI, ROBIN] },
    steps: [{ activate: mine("EB01-030"), ability: "eb01-030#m0", rejects: true }],
    expect: { me: { stage: "EB01-030", hand: [], deckDelta: 0 } },
  },

  // EB02-009 Thousand Sunny (manual): [Activate: Main] You may rest this Stage: Give up to 1 of your currently given DON!! cards to 1 of your {Straw Hat Crew} Characters.
  {
    card: "EB02-009", name: "moves a given DON!! from the Leader to a Straw Hat Crew Character",
    me: { stage: "EB02-009", field: [CHOPPER], leaderDon: 2 },
    steps: [{ activate: mine("EB02-009"), ability: "eb02-009#m0" }, { pick: ["ST01-001"] }],
    expect: { me: { attached: { [CHOPPER]: 1, "ST01-001": 1 } } },
  },
];

runScenarios("leaders and statics", rows);
