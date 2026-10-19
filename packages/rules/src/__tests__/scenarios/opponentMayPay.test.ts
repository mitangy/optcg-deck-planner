/**
 * "Your opponent may PAY. If they do not, Y" (#515). The opponent is only offered PAY when they can pay it in
 * full; paying part of it never counts as doing it. Every row gives the opponent a hand/Life/DON!! count one
 * short of the cost or exactly enough, and pairs accept with decline.
 *
 * The opponent draws one card at the start of their turn, so rows list their hand without it and name that card
 * in `deckTop`.
 */
import { runScenarios, mine, theirs, type CardScenario } from "../../testing/scenario.js";

const KAROO = "ST01-003"; // vanilla 1-cost 3000
const VIVI = "ST01-009"; // vanilla 2-cost 4000
const ROBIN = "ST01-008"; // vanilla 3-cost 5000
const KOMACHIYO = "OP01-010"; // vanilla 1-cost 3000
const MOHJI = "OP02-060"; // vanilla 1-cost 3000

const rows: CardScenario[] = [
  // OP17-117 Maser Saber: [Trigger] Your opponent may trash 3 cards from their hand. If they do not, KO up to 1 of your opponent's Characters with a cost of 6 or less.
  {
    card: "OP17-117", name: "does not offer the trash with 2 cards in hand, so the K.O. comes next (#515)",
    me: { life: ["OP17-117", KAROO, KAROO] },
    opp: { hand: [VIVI], deckTop: [KAROO], field: [ROBIN, MOHJI] },
    steps: [{ endTurn: true }, { attack: theirs(ROBIN), at: "leader" }, { passBattle: true }, { accept: true }],
    expect: { opp: { hand: [VIVI, KAROO], trash: [] }, pending: "select" },
  },
  {
    card: "OP17-117", name: "K.O.s the Character when the opponent has only 2 cards to trash (#515)",
    me: { life: ["OP17-117", KAROO, KAROO] },
    opp: { hand: [VIVI], deckTop: [KAROO], field: [ROBIN, MOHJI] },
    steps: [{ endTurn: true }, { attack: theirs(ROBIN), at: "leader" }, { passBattle: true }, { accept: true }, { pick: [MOHJI] }],
    expect: { opp: { hand: [VIVI, KAROO], field: [ROBIN], trash: [MOHJI] }, pending: "none" },
  },
  {
    card: "OP17-117", name: "accept: trashing 3 cards from the hand prevents the K.O. (#515)",
    me: { life: ["OP17-117", KAROO, KAROO] },
    opp: { hand: [VIVI, KOMACHIYO], deckTop: [KAROO], field: [ROBIN, MOHJI] },
    steps: [{ endTurn: true }, { attack: theirs(ROBIN), at: "leader" }, { passBattle: true }, { accept: true }, { accept: true }],
    expect: { opp: { hand: [], field: [ROBIN, MOHJI], trash: [VIVI, KOMACHIYO, KAROO] }, pending: "none" },
  },
  {
    card: "OP17-117", name: "decline: the opponent keeps the hand and the Character is K.O.'d (#515)",
    me: { life: ["OP17-117", KAROO, KAROO] },
    opp: { hand: [VIVI, KOMACHIYO], deckTop: [KAROO], field: [ROBIN, MOHJI] },
    steps: [{ endTurn: true }, { attack: theirs(ROBIN), at: "leader" }, { passBattle: true }, { accept: true }, { decline: true }, { pick: [MOHJI] }],
    expect: { opp: { hand: [VIVI, KOMACHIYO, KAROO], field: [ROBIN], trash: [MOHJI] }, pending: "none" },
  },

  // OP05-099 Amazon: [On Your Opponent's Attack] You may rest this Character: Your opponent may trash 1 card from the top of their Life cards. If they do not, give up to 1 of your opponent's Leader or Character cards -2000 power during this turn.
  {
    card: "OP05-099", name: "does not offer the Life trash with 0 Life, so the -2000 comes next (#515)",
    me: { field: ["OP05-099"] },
    opp: { field: [ROBIN], life: [] },
    steps: [{ endTurn: true }, { attack: theirs(ROBIN), at: "leader" }, { accept: true }],
    expect: { opp: { life: 0, trash: [] }, pending: "select" },
  },
  {
    card: "OP05-099", name: "gives -2000 when the opponent has no Life to trash (#515)",
    me: { field: ["OP05-099"] },
    opp: { field: [ROBIN], life: [] },
    steps: [{ endTurn: true }, { attack: theirs(ROBIN), at: "leader" }, { accept: true }, { pick: [ROBIN] }],
    expect: { opp: { power: { [ROBIN]: 3000 } }, me: { rested: ["OP05-099"] }, pending: "none" },
  },
  {
    card: "OP05-099", name: "accept: trashing the last Life card prevents the -2000 (#515)",
    me: { field: ["OP05-099"] },
    opp: { field: [ROBIN], life: [VIVI] },
    steps: [{ endTurn: true }, { attack: theirs(ROBIN), at: "leader" }, { accept: true }, { accept: true }],
    expect: { opp: { life: 0, trash: [VIVI], power: { [ROBIN]: 5000 } }, pending: "none" },
  },
  {
    card: "OP05-099", name: "decline: the opponent keeps the Life card and gets -2000 (#515)",
    me: { field: ["OP05-099"] },
    opp: { field: [ROBIN], life: [VIVI] },
    steps: [{ endTurn: true }, { attack: theirs(ROBIN), at: "leader" }, { accept: true }, { decline: true }, { pick: [ROBIN] }],
    expect: { opp: { life: [VIVI], trash: [], power: { [ROBIN]: 3000 } }, pending: "none" },
  },

  // OP15-059 Amazon: [On Your Opponent's Attack] You may rest this Character: Your opponent may return 1 of their active DON!! cards to their DON!! deck. If they do not, give up to 1 of your opponent's Leader or Character cards -2000 power during this turn.
  {
    card: "OP15-059", name: "does not offer the DON!! return with no active DON!!, so the -2000 comes next (#515)",
    me: { field: ["OP15-059"] },
    opp: { hand: [VIVI], field: [ROBIN], don: { active: 0 } },
    steps: [{ endTurn: true }, { play: VIVI, seat: 1 }, { attack: theirs(ROBIN), at: "leader" }, { accept: true }],
    expect: { opp: { don: { active: 0, rested: 2 } }, pending: "select" },
  },
  {
    card: "OP15-059", name: "gives -2000 when the opponent has no active DON!! to return (#515)",
    me: { field: ["OP15-059"] },
    opp: { hand: [VIVI], field: [ROBIN], don: { active: 0 } },
    steps: [{ endTurn: true }, { play: VIVI, seat: 1 }, { attack: theirs(ROBIN), at: "leader" }, { accept: true }, { pick: [ROBIN] }],
    expect: { opp: { power: { [ROBIN]: 3000 }, don: { active: 0, rested: 2 } }, pending: "none" },
  },
  {
    card: "OP15-059", name: "accept: returning the last active DON!! prevents the -2000 (#515)",
    me: { field: ["OP15-059"] },
    opp: { hand: [KOMACHIYO], field: [ROBIN], don: { active: 0 } },
    steps: [{ endTurn: true }, { play: KOMACHIYO, seat: 1 }, { attack: theirs(ROBIN), at: "leader" }, { accept: true }, { accept: true }],
    expect: { opp: { power: { [ROBIN]: 5000 }, don: { active: 0, rested: 1 } }, pending: "none" },
  },
  {
    card: "OP15-059", name: "decline: the opponent keeps the active DON!! and gets -2000 (#515)",
    me: { field: ["OP15-059"] },
    opp: { hand: [KOMACHIYO], field: [ROBIN], don: { active: 0 } },
    steps: [{ endTurn: true }, { play: KOMACHIYO, seat: 1 }, { attack: theirs(ROBIN), at: "leader" }, { accept: true }, { decline: true }, { pick: [ROBIN] }],
    expect: { opp: { power: { [ROBIN]: 3000 }, don: { active: 1, rested: 1 } }, pending: "none" },
  },
];

runScenarios("opponent may pay, if they do not (#515)", rows);
