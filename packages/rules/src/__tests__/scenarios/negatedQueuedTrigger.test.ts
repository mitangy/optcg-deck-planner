/**
 * [When Attacking] and [On Your Opponent's Attack] trigger together and the turn player's resolves first, so a [When
 * Attacking] negate stops the other.
 */
import { runScenarios, mine, theirs, type CardScenario } from "../../testing/scenario.js";

const MR0 = "OP18-046";
const SUNDAY = "OP18-041";
const ALVIDA = "EB05-021";
const TEACH = "P-100";
const KAROO = "ST01-003";

const alvidaAttacks = (negate: string[]): CardScenario["steps"] => [
  { endTurn: true },
  { attack: theirs(ALVIDA), at: "leader" },
  { pick: negate },
];

const rows: CardScenario[] = [
  {
    card: MR0, name: "Mr.0 negated by Alvida's [When Attacking] cannot activate [On Your Opponent's Attack] (#1248)",
    leaders: { me: SUNDAY },
    me: { field: [MR0], hand: [KAROO, KAROO] },
    opp: { field: [ALVIDA] },
    steps: alvidaAttacks([MR0]),
    expect: { me: { hand: [KAROO, KAROO], power: { [SUNDAY]: 5000 } }, pending: "none" },
  },
  {
    card: MR0, name: "Mr.0 not negated still activates [On Your Opponent's Attack] (#1248)",
    leaders: { me: SUNDAY },
    me: { field: [MR0], hand: [KAROO, KAROO] },
    opp: { field: [ALVIDA] },
    steps: [...alvidaAttacks([])!, { accept: true }, { pick: [KAROO] }],
    expect: { me: { hand: [KAROO], trash: [KAROO], power: { [SUNDAY]: 7000 } } },
  },
  {
    card: SUNDAY, name: "Ms. All Sunday negated by Teach does not draw when a Baroque Works Character is K.O.'d (#1248)",
    leaders: { me: SUNDAY },
    me: { field: [{ card: MR0, rested: true }], hand: [KAROO] },
    opp: { field: [TEACH], hand: [KAROO] },
    steps: [{ endTurn: true }, { attack: theirs(TEACH), at: mine(MR0) }, { passBattle: true }],
    expect: { me: { hand: [KAROO], trash: [MR0], deckDelta: 0 }, opp: { trash: [] }, pending: "none" },
  },
];

runScenarios("Negated cards do not activate queued triggers (#1248)", rows);
