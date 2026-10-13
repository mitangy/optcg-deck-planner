/**
 * Vegapunk (OP07-097) [Activate: Main]: select up to 1 {Egghead} card with a cost of 5 or less from your hand and play
 * it or add it to the top of your Life cards face-up. An Event can't be played this way (official Q&A), so it can only
 * go to Life, and picking nothing asks nothing more (#592).
 */
import { runScenarios, mine, type CardScenario } from "../../testing/scenario.js";

const VEGAPUNK = "OP07-097";
const EVENT = "OP07-115"; // {Egghead} Event, cost 1
const SHAKA = "OP07-101"; // {Egghead} Character, cost 5
const KAROO = "ST01-003"; // vanilla, not {Egghead}
const ABILITY = "op07-097#m0";

const rows: CardScenario[] = [
  {
    card: VEGAPUNK, name: "an Egghead Event goes straight to the top of Life face-up with no Play choice (#592)",
    leaders: { me: VEGAPUNK },
    me: { hand: [EVENT], don: { active: 1 } },
    steps: [{ activate: mine(VEGAPUNK), ability: ABILITY }, { pick: [EVENT] }],
    expect: { me: { hand: [], life: 3, faceUp: [true, false, false] }, pending: "none" },
  },
  {
    card: VEGAPUNK, name: "with no {Egghead} card in hand it asks nothing after the DON!! is rested (#592)",
    leaders: { me: VEGAPUNK },
    me: { hand: [KAROO], don: { active: 1 } },
    steps: [{ activate: mine(VEGAPUNK), ability: ABILITY }],
    expect: { me: { hand: [KAROO], life: 2 }, pending: "none" },
  },
  {
    card: VEGAPUNK, name: "an Egghead Character can still be played (#592)",
    leaders: { me: VEGAPUNK },
    me: { hand: [SHAKA], don: { active: 1 } },
    steps: [{ activate: mine(VEGAPUNK), ability: ABILITY }, { pick: [SHAKA] }, { pick: ["Play it"] }],
    expect: { me: { hand: [], field: [SHAKA], life: 2 }, pending: "none" },
  },
];

runScenarios("Vegapunk Leader (OP07-097)", rows);
