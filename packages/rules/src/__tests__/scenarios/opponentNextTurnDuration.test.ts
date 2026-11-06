/**
 * "...until the end of your opponent's next turn" resolved during your OPPONENT'S turn refers to the end of that
 * current turn (ST21-015 Roronoa Zoro Q&A); resolved on your own turn it lasts through the opponent's whole next turn.
 * OP14-111 Perona's [On K.O.] is usually triggered on the opponent's turn (#1012).
 */
import { runScenarios, mine, theirs, type CardScenario } from "../../testing/scenario.js";

const PERONA = "OP14-111"; // [On Play]/[On K.O.] Up to 1 of your opponent's Characters with a cost of 6 or less cannot attack until the end of your opponent's next End Phase.
const KOER = "ST01-010"; // vanilla 4-cost 6000: K.O.s a rested Perona in battle
const TARGET = "ST01-003"; // vanilla 1-cost 3000: the Character Perona's effect restricts

const rows: CardScenario[] = [
  {
    card: PERONA, name: "On K.O. cannot-attack ends with the opponent's current turn (#1012)",
    me: { field: [{ card: PERONA, rested: true }] },
    opp: { field: [KOER, TARGET] },
    steps: [
      { endTurn: true },
      { attack: theirs(KOER), at: mine(PERONA) },
      { passBattle: true },
      { pick: [TARGET] },
      // Still the same opponent turn: restricted.
      { attack: theirs(TARGET), at: "leader", rejects: true },
      { endTurn: true },
      { endTurn: true },
      // The opponent's following turn: the restriction is gone.
      { attack: theirs(TARGET), at: "leader" },
    ],
    expect: { me: { field: [], trash: [PERONA] } },
  },
  {
    card: PERONA, name: "On Play on my own turn still lasts through the opponent's whole next turn (#1012)",
    me: { hand: [PERONA], don: { active: 4 } },
    opp: { field: [TARGET] },
    steps: [
      { play: PERONA },
      { pick: [TARGET] },
      { endTurn: true },
      { attack: theirs(TARGET), at: "leader", rejects: true },
      { endTurn: true },
      { endTurn: true },
      { attack: theirs(TARGET), at: "leader" },
    ],
    expect: { me: { field: [PERONA] } },
  },
];

runScenarios("Until the end of your opponent's next turn (#1012)", rows);
