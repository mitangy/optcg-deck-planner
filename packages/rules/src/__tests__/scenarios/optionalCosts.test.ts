/**
 * "You may pay X: Y" cards. Each has an accept row (pays, Y happens) and a
 * decline row (nothing is paid, Y is skipped).
 */
import { runScenarios, mine, theirs, type CardScenario } from "../../testing/scenario.js";

const KAROO = "ST01-003"; // vanilla 1-cost 3000
const VIVI = "ST01-009"; // vanilla 2-cost 4000
const ROBIN = "ST01-008"; // vanilla 3-cost 5000
const KOMACHIYO = "OP01-010"; // vanilla 1-cost, {Land of Wano}

const rows: CardScenario[] = [
  // OP01-011 Gordon: [On Play] You may place 1 card from your hand at the bottom of your deck: Draw 1 card.
  {
    card: "OP01-011", name: "accept: places a hand card at the bottom and draws",
    me: { hand: ["OP01-011", KAROO], don: { active: 2 }, deckTop: [KOMACHIYO] },
    steps: [{ play: "OP01-011" }, { accept: true }],
    expect: { me: { hand: [KOMACHIYO], field: ["OP01-011"], deckDelta: 0, deckTop: "ST01-003" } },
  },
  {
    card: "OP01-011", name: "decline: keeps the hand and the deck",
    me: { hand: ["OP01-011", KAROO], don: { active: 2 }, deckTop: [KOMACHIYO] },
    steps: [{ play: "OP01-011" }, { decline: true }],
    expect: { me: { hand: [KAROO], field: ["OP01-011"], deckTop: KOMACHIYO }, pending: "none" },
  },

  // OP01-008 Cavendish: [On Play] You may add 1 card from your Life area to your hand: gains [Rush] this turn.
  {
    card: "OP01-008", name: "accept: takes the top Life card and gains Rush",
    me: { hand: ["OP01-008"], don: { active: 4 }, life: [VIVI, KAROO, KAROO] },
    steps: [{ play: "OP01-008" }, { accept: true }],
    expect: { me: { hand: [VIVI], life: [KAROO, KAROO], keywords: { "OP01-008": ["rush"] } } },
  },
  {
    card: "OP01-008", name: "decline: keeps all Life and gains no Rush",
    me: { hand: ["OP01-008"], don: { active: 4 }, life: [VIVI, KAROO, KAROO] },
    steps: [{ play: "OP01-008" }, { decline: true }],
    expect: { me: { hand: [], life: [VIVI, KAROO, KAROO], keywords: { "OP01-008": [] } }, pending: "none" },
  },

  // EB01-056 Charlotte Flampe: [On Play] You may add 1 card from the top or bottom of your Life cards to your hand: Draw 1 card.
  {
    card: "EB01-056", name: "accept: takes the bottom Life card and draws",
    me: { hand: ["EB01-056"], don: { active: 1 }, life: [VIVI, ROBIN, KOMACHIYO], deckTop: [KAROO] },
    steps: [{ play: "EB01-056" }, { accept: true }, { pick: ["Bottom"] }],
    expect: { me: { hand: [KOMACHIYO, KAROO], life: [VIVI, ROBIN], deckDelta: -1 } },
  },
  {
    card: "EB01-056", name: "decline: keeps all Life and does not draw",
    me: { hand: ["EB01-056"], don: { active: 1 }, life: [VIVI, ROBIN, KOMACHIYO], deckTop: [KAROO] },
    steps: [{ play: "EB01-056" }, { decline: true }],
    expect: { me: { hand: [], life: [VIVI, ROBIN, KOMACHIYO], deckTop: KAROO }, pending: "none" },
  },

  // OP16-108 Shiryu: [On Play] You may trash 1 card from your hand: Add up to 1 {Blackbeard Pirates} card with a cost of 6 or less from your trash to the top of your Life face-up.
  {
    card: "OP16-108", name: "accept: trashes a card and puts a Blackbeard Pirates card on Life face-up",
    me: { hand: ["OP16-108", KAROO], don: { active: 6 }, life: [VIVI], trash: ["OP09-082", ROBIN] },
    steps: [{ play: "OP16-108" }, { accept: true }, { pick: ["OP09-082"] }],
    expect: { me: { hand: [], life: ["OP09-082", VIVI], faceUp: [true, false], trash: [ROBIN, KAROO] } },
  },
  {
    card: "OP16-108", name: "decline: trashes nothing and Life is unchanged",
    me: { hand: ["OP16-108", KAROO], don: { active: 6 }, life: [VIVI], trash: ["OP09-082", ROBIN] },
    steps: [{ play: "OP16-108" }, { decline: true }],
    expect: { me: { hand: [KAROO], life: [VIVI], trash: ["OP09-082", ROBIN] }, pending: "none" },
  },

  // OP01-055 You Can Be My Samurai!!: [Main] You may rest 2 of your Characters: Draw 2 cards.
  {
    card: "OP01-055", name: "accept: rests 2 Characters and draws 2",
    me: { hand: ["OP01-055"], don: { active: 1 }, field: [KAROO, VIVI, ROBIN], deckTop: [KOMACHIYO, KOMACHIYO] },
    steps: [{ play: "OP01-055" }, { accept: true }, { pick: [KAROO, VIVI] }],
    expect: { me: { hand: [KOMACHIYO, KOMACHIYO], rested: [KAROO, VIVI], deckDelta: -2 } },
  },
  {
    card: "OP01-055", name: "decline: rests nothing and does not draw",
    me: { hand: ["OP01-055"], don: { active: 1 }, field: [KAROO, VIVI, ROBIN], deckTop: [KOMACHIYO, KOMACHIYO] },
    steps: [{ play: "OP01-055" }, { decline: true }],
    expect: { me: { hand: [], rested: [], deckDelta: 0 }, pending: "none" },
  },

  // EB01-051 Finger Pistol: [Main] You may trash 2 cards from the top of your deck: K.O. up to 1 of your opponent's Characters with a cost of 5 or less.
  {
    card: "EB01-051", name: "accept: trashes 2 deck cards and K.O.s a Character",
    me: { hand: ["EB01-051"], don: { active: 4 }, deckTop: [KOMACHIYO, ROBIN] },
    opp: { field: [VIVI, "EB02-001"] },
    steps: [{ play: "EB01-051" }, { accept: true }, { pick: [VIVI] }],
    expect: { me: { deckDelta: -2, trash: ["EB01-051", KOMACHIYO, ROBIN] }, opp: { field: ["EB02-001"] } },
  },
  {
    card: "EB01-051", name: "decline: mills nothing and K.O.s nothing",
    me: { hand: ["EB01-051"], don: { active: 4 }, deckTop: [KOMACHIYO, ROBIN] },
    opp: { field: [VIVI, "EB02-001"] },
    steps: [{ play: "EB01-051" }, { decline: true }],
    expect: { me: { deckDelta: 0, trash: ["EB01-051"] }, opp: { field: [VIVI, "EB02-001"] }, pending: "none" },
  },

  // ST30-004 Emporio.Ivankov: [On Play] You may reveal 2 Character cards with 6000 power from your hand: Draw 3 cards and trash 2 cards from your hand.
  {
    card: "ST30-004", name: "accept: reveals two 6000-power Characters, draws 3, trashes 2",
    me: { hand: ["ST30-004", "OP01-018", "OP01-045"], don: { active: 1 }, deckTop: [KAROO, VIVI, ROBIN] },
    steps: [{ play: "ST30-004" }, { accept: true }, { pick: [KAROO, VIVI] }],
    expect: { me: { hand: ["OP01-018", "OP01-045", ROBIN], trash: [KAROO, VIVI], deckDelta: -3 } },
  },
  {
    card: "ST30-004", name: "decline: reveals nothing and draws nothing",
    me: { hand: ["ST30-004", "OP01-018", "OP01-045"], don: { active: 1 }, deckTop: [KAROO, VIVI, ROBIN] },
    steps: [{ play: "ST30-004" }, { decline: true }],
    expect: { me: { hand: ["OP01-018", "OP01-045"], trash: [], deckDelta: 0 }, pending: "none" },
  },

  // OP02-068 Gum-Gum Rain: [Counter] You may trash 1 card from your hand: Up to 1 of your Leader or Character cards gains +3000 power during this battle.
  {
    card: "OP02-068", name: "accept: trashes a card and the Leader gains +3000 this battle",
    me: { hand: ["OP02-068", KAROO] },
    opp: { field: [ROBIN] },
    steps: [{ endTurn: true }, { attack: theirs(ROBIN), at: "leader" }, { passBlock: true }, { counter: "OP02-068" }, { accept: true }, { pick: ["ST01-001"] }],
    expect: { me: { hand: [], trash: ["OP02-068", KAROO], power: { "ST01-001": 8000 } } },
  },
  {
    card: "OP02-068", name: "decline: trashes nothing and no power is gained",
    me: { hand: ["OP02-068", KAROO] },
    opp: { field: [ROBIN] },
    steps: [{ endTurn: true }, { attack: theirs(ROBIN), at: "leader" }, { passBlock: true }, { counter: "OP02-068" }, { decline: true }],
    expect: { me: { hand: [KAROO], trash: ["OP02-068"], power: { "ST01-001": 5000 } }, pending: "none" },
  },

  // OP01-064 Alvida: [DON!! x1] [When Attacking] You may trash 1 card from your hand: Return up to 1 of your opponent's Characters with a cost of 3 or less to the owner's hand.
  {
    card: "OP01-064", name: "accept: trashes a card and returns an opposing Character to hand",
    me: { hand: [VIVI], field: [{ card: "OP01-064", don: 1 }] },
    opp: { field: [KAROO, "EB02-001"] },
    steps: [{ attack: mine("OP01-064"), at: "leader" }, { accept: true }, { pick: [KAROO] }],
    expect: { me: { hand: [], trash: [VIVI] }, opp: { field: ["EB02-001"], hand: [KAROO] } },
  },
  {
    card: "OP01-064", name: "decline: trashes nothing and returns nothing",
    me: { hand: [VIVI], field: [{ card: "OP01-064", don: 1 }] },
    opp: { field: [KAROO, "EB02-001"] },
    steps: [{ attack: mine("OP01-064"), at: "leader" }, { decline: true }],
    expect: { me: { hand: [VIVI], trash: [] }, opp: { field: [KAROO, "EB02-001"], hand: [] }, pending: "none" },
  },
];

runScenarios("optional costs", rows);
