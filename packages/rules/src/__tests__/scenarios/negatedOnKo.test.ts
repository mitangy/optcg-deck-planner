/**
 * A Character whose effects are negated cannot activate its [On K.O.] or "when this Character is K.O.'d" effect when
 * it is K.O.'d (Comprehensive Rules 10-2-17-1; OP09-093 / OP09-097 / OP09-098 Q&A). The opponent negates with
 * Ground Death on their own turn, then K.O.s the rested Character in battle (#1001).
 */
import { runScenarios, mine, theirs, type CardScenario } from "../../testing/scenario.js";

const NAMI = "EB03-053"; // [On K.O.] You may turn 1 card from the top of your Life cards face-up: Play up to 1 Character card with 6000 power or less from your hand.
const LIM = "OP03-015"; // [Opponent's Turn] When this Character is K.O.'d, give up to 1 of your opponent's Leader or Character cards -2000 power during this turn.
const GROUND_DEATH = "OP14-096"; // [Main] You may rest 2 of your DON!! cards: Negate the effect of up to 1 of your opponent's Characters with a cost of 5 or less during this turn.
const ATTACKER = "ST01-010"; // vanilla 4-cost 6000, enough to K.O. a rested 6000-power Nami in battle
const KAROO = "ST01-003"; // vanilla 1-cost 3000
const LIFE = [KAROO, KAROO, KAROO];

const opponentKos = (target: string, negate: boolean): CardScenario["steps"] => [
  { endTurn: true },
  ...(negate ? [{ play: GROUND_DEATH, seat: 1 as const }, { accept: true as const }, { pick: [target] }] : []),
  { attack: theirs(ATTACKER), at: mine(target) },
  { passBattle: true },
];

const rows: CardScenario[] = [
  {
    card: NAMI, name: "negated Nami's [On K.O.] does not activate when she is K.O.'d (#1001)",
    me: { field: [{ card: NAMI, rested: true }], hand: [KAROO], life: LIFE },
    opp: { field: [ATTACKER], hand: [GROUND_DEATH], don: { active: 3 } },
    steps: opponentKos(NAMI, true),
    expect: { me: { field: [], trash: [NAMI], hand: [KAROO], life: LIFE, faceUp: [false, false, false] }, pending: "none" },
  },
  {
    card: NAMI, name: "un-negated Nami's [On K.O.] activates when she is K.O.'d (#1001)",
    me: { field: [{ card: NAMI, rested: true }], hand: [KAROO], life: LIFE },
    opp: { field: [ATTACKER] },
    steps: [...opponentKos(NAMI, false)!, { accept: true }, { pick: [KAROO] }],
    expect: { me: { field: [KAROO], trash: [NAMI], hand: [], life: LIFE, faceUp: [true, false, false] }, pending: "none" },
  },
  {
    card: LIM, name: "negated Lim's \"when this Character is K.O.'d\" effect does not fire (#1001)",
    me: { field: [{ card: LIM, rested: true }] },
    opp: { field: [ATTACKER], hand: [GROUND_DEATH], don: { active: 3 } },
    steps: opponentKos(LIM, true),
    expect: { me: { field: [], trash: [LIM] }, pending: "none" },
  },
  {
    card: LIM, name: "un-negated Lim's \"when this Character is K.O.'d\" effect fires (#1001)",
    me: { field: [{ card: LIM, rested: true }] },
    opp: { field: [ATTACKER] },
    steps: [...opponentKos(LIM, false)!, { pick: [ATTACKER] }],
    expect: { me: { field: [], trash: [LIM] }, opp: { power: { [ATTACKER]: 4000 } }, pending: "none" },
  },
];

runScenarios("Negated Characters do not activate On K.O. (#1001)", rows);
