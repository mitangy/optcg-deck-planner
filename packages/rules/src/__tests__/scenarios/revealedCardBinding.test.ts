/**
 * "The revealed card" keeps pointing at the card that was revealed, even after another step in the same effect
 * picks a different card (#524).
 */
import { runScenarios, theirs, type CardScenario } from "../../testing/scenario.js";

const KAROO = "ST01-003"; // vanilla 1-cost 3000
const ROBIN = "ST01-008"; // vanilla 3-cost 5000
const COST_6 = "EB01-041"; // vanilla 6-cost
const COST_3 = "ST01-008"; // vanilla 3-cost

const rows: CardScenario[] = [
  // EB01-029 Sorry. I'm a Goner.: [Counter] Reveal 1 card from the top of your deck. If the revealed card has a cost of 4 or more, return up to 1 of your Characters to the owner's hand. Then, place the revealed card at the bottom of your deck.
  {
    card: "EB01-029", name: "puts the revealed cost 6 card at the bottom of the deck and keeps the returned Character in hand (#524)",
    me: { field: [ROBIN], hand: ["EB01-029"], don: { active: 1 }, deckTop: [COST_6] },
    opp: { field: [KAROO] },
    steps: [{ endTurn: true }, { attack: theirs(KAROO), at: "leader" }, { passBlock: true }, { counter: "EB01-029" }, { pick: [ROBIN] }],
    expect: { me: { hand: [ROBIN], field: [], deckDelta: 0, deckBottom: COST_6 } },
  },
  {
    card: "EB01-029", name: "puts the revealed cost 3 card at the bottom of the deck without returning a Character (#524)",
    me: { field: [KAROO], hand: ["EB01-029"], don: { active: 1 }, deckTop: [COST_3] },
    opp: { field: [KAROO] },
    steps: [{ endTurn: true }, { attack: theirs(KAROO), at: "leader" }, { passBlock: true }, { counter: "EB01-029" }],
    expect: { me: { hand: [], field: [KAROO], deckDelta: 0, deckBottom: COST_3 } },
  },
];

runScenarios("revealed card binding (#524)", rows);
