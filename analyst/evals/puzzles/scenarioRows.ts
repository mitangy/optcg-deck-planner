/**
 * Scenario rows the puzzle generator turns into questions. They are copied from the engine's scenario tests
 * (packages/rules/src/__tests__/scenarios) because those files run their rows at import and cannot be imported by
 * the eval. Every row is run against the engine by scenarioRows.test.ts, so a copy that drifts from the engine fails.
 */
import type { CardScenario, Where } from "@optcg/rules/src/testing/scenario";
import { FILLER } from "@optcg/rules/src/testing/harness";

const mine = (card: string): Where => ({ seat: 0, card });
const theirs = (card: string): Where => ({ seat: 1, card });
// Some copied rows do not use every helper.
void FILLER;
void mine;
void theirs;

const leadersAndStaticsRows: CardScenario[] = (() : CardScenario[] => {
  const KAROO = "ST01-003";
  const VIVI = "ST01-009";
  const ROBIN = "ST01-008";
  const KOMACHIYO = "OP01-010";
  const MOHJI = "OP02-060";
  const CHOPPER = "ST01-006";
  const trash8 = Array.from({ length: 8 }, () => KAROO);
  return [
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

  {
    card: "OP02-001", name: "adds the top Life card to hand at end of turn",
    leaders: { me: "OP02-001" },
    me: { hand: [], life: [VIVI, KAROO, KAROO] },
    steps: [{ endTurn: true }],
    expect: { me: { hand: [VIVI], life: [KAROO, KAROO] } },
  },

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

  {
    card: "EB02-009", name: "moves a given DON!! from the Leader to a Straw Hat Crew Character",
    me: { stage: "EB02-009", field: [CHOPPER], leaderDon: 2 },
    steps: [{ activate: mine("EB02-009"), ability: "eb02-009#m0" }, { pick: ["ST01-001"] }],
    expect: { me: { attached: { [CHOPPER]: 1, "ST01-001": 1 } } },
  },
  ];
})();

const effectsRows: CardScenario[] = (() : CardScenario[] => {
  const KAROO = "ST01-003";
  const VIVI = "ST01-009";
  const ROBIN = "ST01-008";
  const BIG = "EB02-001";
  const CHOPPER = "ST01-006";
  return [
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

  {
    card: "ST32-002", name: "Character that cannot be rested can't activate Blocker (Kouzuki Oden ST32-002) (#449)",
    me: { hand: ["ST32-002"], field: [ROBIN], don: { active: 5 } },
    opp: { field: [CHOPPER] },
    steps: [{ play: "ST32-002" }, { pick: [CHOPPER] }, { attack: mine(ROBIN), at: "leader" }],
    expect: { opp: { blockers: [] } },
  },
  {
    card: "ST32-002", name: "a Blocker not chosen by Kouzuki Oden can still block (#449)",
    me: { hand: ["ST32-002"], field: [ROBIN], don: { active: 5 } },
    opp: { field: [CHOPPER, "OP04-104"] },
    steps: [{ play: "ST32-002" }, { pick: ["OP04-104"] }, { attack: mine(ROBIN), at: "leader" }],
    expect: { opp: { blockers: [CHOPPER] } },
  },
  {
    card: "ST32-002", name: "Character that cannot be rested can't attack (Kouzuki Oden ST32-002) (#449)",
    me: { hand: ["ST32-002"], don: { active: 5 } },
    opp: { field: [ROBIN] },
    steps: [{ play: "ST32-002" }, { pick: [ROBIN] }, { endTurn: true }, { attack: theirs(ROBIN), at: "leader", rejects: true }],
    expect: { opp: { rested: [] } },
  },
  {
    card: "ST32-002", name: "Character that cannot be rested can't pay a rest-this-Character cost (Kouzuki Oden ST32-002) (#449)",
    me: { hand: ["ST32-002"], don: { active: 5 } },
    opp: { field: ["EB01-016"] },
    steps: [{ play: "ST32-002" }, { pick: ["EB01-016"] }, { endTurn: true }, { activate: theirs("EB01-016"), ability: "eb01-016#0", rejects: true }],
    expect: { opp: { rested: [] } },
  },

  {
    card: "ST32-002", name: "Character that cannot be rested stays active when an effect would rest it (Kouzuki Oden ST32-002) (#449)",
    me: { hand: ["ST32-002", "EB01-015"], don: { active: 7 } },
    opp: { field: [CHOPPER] },
    steps: [{ play: "ST32-002" }, { pick: [CHOPPER] }, { play: "EB01-015" }, { pick: [CHOPPER] }],
    expect: { opp: { rested: [] } },
  },

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
})();

const removedFromFieldRows: CardScenario[] = (() : CardScenario[] => {
  const KAROO = "ST01-003";
  const ROBIN = "ST01-008";
  const BELLAMY = "OP01-076";
  const JAMBE = "OP02-046";
  const PISTOL = "OP10-060";
  const BENN = "OP09-009";
  const HEAVENLY_FIRE = "OP04-117";
  const GONER = "EB01-029";
  const WATER_STREAM = "OP06-019";
  const HAMLET = "OP08-090";
  const DOBON = "OP02-080";
  return [
  {
    card: "OP07-038", name: "draws when your effect K.O.s the opponent's Character (#524)",
    leaders: { me: "OP07-038" },
    me: { hand: [JAMBE], don: { active: 2 }, deckTop: [ROBIN] },
    opp: { field: [{ card: KAROO, rested: true }] },
    steps: [{ play: JAMBE }, { pick: [KAROO] }, { accept: true }],
    expect: { me: { hand: [ROBIN] }, opp: { field: [] }, pending: "none" },
  },
  {
    card: "OP07-038", name: "draws when your effect places the opponent's Character at the bottom of the deck (#524)",
    leaders: { me: "OP07-038" },
    me: { hand: [PISTOL], don: { active: 5 }, deckTop: [ROBIN] },
    opp: { field: [KAROO] },
    steps: [{ play: PISTOL }, { pick: [KAROO] }, { accept: true }],
    expect: { me: { hand: [ROBIN] }, opp: { field: [], deckBottom: KAROO }, pending: "none" },
  },
  {
    card: "OP07-038", name: "draws when your effect adds the opponent's Character to their Life cards (#524)",
    leaders: { me: "OP07-038" },
    me: { hand: [HEAVENLY_FIRE], don: { active: 1 }, deckTop: [ROBIN] },
    opp: { field: [KAROO] },
    steps: [{ play: HEAVENLY_FIRE }, { pick: [KAROO] }, { pick: ["Top"] }, { accept: true }],
    expect: { me: { hand: [ROBIN] }, opp: { field: [], life: 6 }, pending: "none" },
  },
  {
    card: "OP07-038", name: "can be declined once and still used for a later removal the same turn (#524)",
    leaders: { me: "OP07-038" },
    me: { hand: [JAMBE, JAMBE], don: { active: 4 }, deckTop: [ROBIN] },
    opp: { field: [{ card: KAROO, rested: true }, { card: ROBIN, rested: true }] },
    steps: [{ play: JAMBE }, { pick: [KAROO] }, { decline: true }, { play: JAMBE }, { pick: [ROBIN] }, { accept: true }],
    expect: { me: { hand: [ROBIN] }, opp: { field: [] }, pending: "none" },
  },
  {
    card: "OP07-038", name: "does not draw when the opponent's [Trigger] K.O.s your Character (#524)",
    leaders: { me: "OP07-038" },
    me: { field: [ROBIN, KAROO] },
    opp: { life: [WATER_STREAM, KAROO] },
    steps: [{ attack: mine(ROBIN), at: "leader" }, { passBattle: true }, { accept: true }, { pick: [KAROO] }],
    expect: { me: { hand: [], field: [ROBIN] }, pending: "none" },
  },
  {
    card: "OP07-038", name: "does not draw when the opponent's [Trigger] returns your Character to your hand (#524)",
    leaders: { me: "OP07-038" },
    me: { field: [ROBIN, KAROO] },
    opp: { life: [GONER, KAROO] },
    steps: [{ attack: mine(ROBIN), at: "leader" }, { passBattle: true }, { accept: true }, { pick: [KAROO] }],
    expect: { me: { hand: [KAROO], field: [ROBIN] }, pending: "none" },
  },
  {
    card: "OP07-038", name: "does not draw when a 6th Character is played and one is trashed to make room (#524)",
    leaders: { me: "OP07-038" },
    me: { field: [KAROO, KAROO, KAROO, KAROO], hand: [HAMLET], trash: [DOBON], don: { active: 3 }, deckTop: [ROBIN] },
    steps: [{ play: HAMLET }, { pick: [DOBON] }, { pick: [KAROO] }],
    expect: { me: { hand: [], field: [KAROO, KAROO, KAROO, HAMLET, DOBON] }, pending: "none" },
  },

  {
    card: "OP08-046", name: "rests itself and makes the opponent place a card when your effect K.O.s a Character (#524)",
    me: { field: ["OP08-046"], hand: [JAMBE], don: { active: 2 } },
    opp: { field: [{ card: KAROO, rested: true }], hand: [ROBIN, ROBIN, ROBIN, ROBIN, ROBIN] },
    steps: [{ play: JAMBE }, { pick: [KAROO] }, { pick: [ROBIN] }],
    expect: { me: { rested: ["OP08-046"] }, opp: { deckBottom: ROBIN, hand: [ROBIN, ROBIN, ROBIN, ROBIN] }, pending: "none" },
  },
  {
    card: "OP08-046", name: "does nothing when the opponent's [Trigger] returns a Character (#524)",
    me: { field: ["OP08-046", ROBIN] },
    opp: { life: [GONER, KAROO], hand: [ROBIN, ROBIN, ROBIN, ROBIN, ROBIN] },
    steps: [{ attack: mine(ROBIN), at: "leader" }, { passBattle: true }, { accept: true }, { pick: [ROBIN] }],
    expect: { me: { rested: [] }, pending: "none" },
  },

  {
    card: "OP09-080", name: "adds a rested DON!! when the opponent's effect K.O.s your {Straw Hat Crew} Character (#524)",
    me: { stage: "OP09-080", field: [{ card: ROBIN, rested: true }], don: { active: 0 } },
    opp: { hand: [JAMBE], don: { active: 2 } },
    steps: [{ endTurn: true }, { play: JAMBE }, { pick: [ROBIN] }, { accept: true }],
    expect: { me: { field: [], don: { active: 0, rested: 1 } } },
  },

  {
    card: "OP10-042", name: "draws exactly once when the opponent's effect K.O.s your {Dressrosa} Character (#524)",
    leaders: { me: "OP10-042" },
    me: { field: [{ card: BELLAMY, rested: true }], deckTop: [KAROO] },
    opp: { hand: [JAMBE], don: { active: 2 } },
    steps: [{ endTurn: true }, { play: JAMBE }, { pick: [BELLAMY] }, { accept: true }],
    expect: { me: { hand: [KAROO], field: [], trash: [BELLAMY] }, pending: "none" },
  },
  {
    card: "OP10-042", name: "is offered once, not twice, when the opponent's effect K.O.s your {Dressrosa} Character (#524)",
    leaders: { me: "OP10-042" },
    me: { field: [{ card: BELLAMY, rested: true }], deckTop: [KAROO] },
    opp: { hand: [JAMBE], don: { active: 2 } },
    steps: [{ endTurn: true }, { play: JAMBE }, { pick: [BELLAMY] }, { decline: true }],
    expect: { me: { hand: [], field: [], trash: [BELLAMY] }, pending: "none" },
  },
  {
    card: "OP10-042", name: "draws when the opponent's effect trashes your {Dressrosa} Character without a K.O. (#524)",
    leaders: { me: "OP10-042" },
    me: { field: [BELLAMY], deckTop: [KAROO] },
    opp: { hand: [BENN], don: { active: 7 } },
    steps: [{ endTurn: true }, { play: BENN }, { pick: [BELLAMY] }, { accept: true }],
    expect: { me: { hand: [KAROO], field: [], trash: [BELLAMY] }, pending: "none" },
  },
  {
    card: "OP10-042", name: "draws when the opponent's effect places your {Dressrosa} Character at the bottom of the deck (#524)",
    leaders: { me: "OP10-042" },
    me: { field: [BELLAMY], deckTop: [KAROO] },
    opp: { hand: [PISTOL], don: { active: 5 } },
    steps: [{ endTurn: true }, { play: PISTOL }, { pick: [BELLAMY] }, { accept: true }],
    expect: { me: { hand: [KAROO], field: [], deckBottom: BELLAMY }, pending: "none" },
  },
  ];
})();

const opponentMayPayRows: CardScenario[] = (() : CardScenario[] => {
  const KAROO = "ST01-003";
  const VIVI = "ST01-009";
  const ROBIN = "ST01-008";
  const KOMACHIYO = "OP01-010";
  const MOHJI = "OP02-060";
  return [
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
})();

const optionalCostsRows: CardScenario[] = (() : CardScenario[] => {
  const KAROO = "ST01-003";
  const VIVI = "ST01-009";
  const ROBIN = "ST01-008";
  const KOMACHIYO = "OP01-010";
  return [
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
})();

const replacementScopeRows: CardScenario[] = (() : CardScenario[] => {
  const THATCH = "OP08-045";
  const KAROO = "ST01-003";
  const ROBIN = "ST01-008";
  const HAKUBA = "OP05-087";
  const MUGGY_BALL = "OP09-058";
  const JAMBE = "OP02-046";
  const LABOON = "EB01-047";
  const BORSALINO = "OP12-053";
  const GIRL = "P-096";
  const BRICK_FIST = "OP02-067";
  return [
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
})();

const eb05Rows: CardScenario[] = (() : CardScenario[] => {
  const KAROO = "ST01-003";
  const BIG = "EB02-001";
  const SHIRAHOSHI_LEADER = "OP11-022";
  const WISDOM = "OP01-036";
  const WISDOM_BLOCKER = "EB02-012";
  const RA_TRIGGER = "OP09-108";
  const RA_PLAIN = "OP05-012";
  const TRIGGER_OTHER = "OP01-037";
  const STRIKE = "OP01-010";
  return [
  {
    card: "EB05-020", name: "rests a [Shirahoshi] Leader to draw 2 cards (#458)",
    leaders: { me: SHIRAHOSHI_LEADER },
    me: { hand: ["EB05-020"], don: { active: 1 } },
    steps: [{ play: "EB05-020" }, { accept: true }],
    expect: { me: { hand: [FILLER, FILLER], deckDelta: -2 } },
  },
  {
    card: "EB05-020", name: "cannot pay with a Leader that is not [Shirahoshi] (#458)",
    me: { hand: ["EB05-020"], don: { active: 1 } },
    steps: [{ play: "EB05-020" }],
    expect: { me: { hand: [], deckDelta: 0 }, pending: "none" },
  },

  {
    card: "EB05-028", name: "makes an opponent with 9 cards in hand trash 4 of them (#458)",
    me: { hand: ["EB05-028"], don: { active: 4 } },
    opp: { hand: [KAROO, KAROO, KAROO, KAROO, KAROO, KAROO, KAROO, KAROO, "EB02-001"] },
    steps: [{ play: "EB05-028" }, { pick: [KAROO, KAROO, KAROO, KAROO] }],
    expect: { opp: { hand: [KAROO, KAROO, KAROO, KAROO, "EB02-001"], trash: [KAROO, KAROO, KAROO, KAROO] } },
  },
  {
    card: "EB05-028", name: "does nothing to an opponent with 8 cards in hand (#458)",
    me: { hand: ["EB05-028"], don: { active: 4 } },
    opp: { hand: [KAROO, KAROO, KAROO, KAROO, KAROO, KAROO, KAROO, KAROO] },
    steps: [{ play: "EB05-028" }],
    expect: { opp: { trash: [] }, pending: "none" },
  },

  {
    card: "EB05-008", name: "Counter gives the Leader +4000 when no Character costs 5 or more (#458)",
    me: { field: [KAROO], don: { active: 1 } },
    opp: { hand: ["EB05-008"], field: [KAROO], don: { active: 1 } },
    steps: [{ attack: mine("ST01-001"), at: "leader" }, { passBlock: true }, { counter: "EB05-008" }, { pick: ["ST01-001"] }],
    expect: { opp: { power: { "ST01-001": 9000 } } },
  },
  {
    card: "EB05-008", name: "Counter does nothing with a cost 5 Character on the field (#458)",
    me: { field: [KAROO], don: { active: 1 } },
    opp: { hand: ["EB05-008"], field: [BIG], don: { active: 1 } },
    steps: [{ attack: mine("ST01-001"), at: "leader" }, { passBlock: true }, { counter: "EB05-008" }],
    expect: { opp: { power: { "ST01-001": 5000 } }, pending: "none" },
  },

  {
    card: "EB05-005", name: "powers a {Revolutionary Army} Character that has a [Trigger] (#458)",
    me: { hand: ["EB05-005"], field: [RA_TRIGGER], don: { active: 2 } },
    steps: [{ play: "EB05-005" }, { pick: [RA_TRIGGER] }],
    expect: { me: { power: { [RA_TRIGGER]: 7000 } } },
  },
  {
    card: "EB05-005", name: "offers neither a Character without [Trigger] nor one of another type (#458)",
    me: { hand: ["EB05-005"], field: [RA_PLAIN, TRIGGER_OTHER], don: { active: 2 } },
    steps: [{ play: "EB05-005" }],
    expect: { me: { power: { [RA_PLAIN]: 5000, [TRIGGER_OTHER]: 3000 } }, pending: "none" },
  },

  {
    card: "EB05-057", name: "gives a rested DON!! to a Wisdom Character (#458)",
    me: { field: ["EB05-057", WISDOM], don: { active: 0, rested: 1 } },
    steps: [{ activate: mine("EB05-057"), ability: "eb05-057#0" }, { pick: [WISDOM] }],
    expect: { me: { attached: { [WISDOM]: 1 } } },
  },
  ];
})();

const op18Rows: CardScenario[] = (() : CardScenario[] => {
  const KAROO = "ST01-003";
  const VIVI = "ST01-009";
  const KOMACHIYO = "OP01-010";
  const SPEED = "OP01-104";
  const HAMLET = "OP08-090";
  const ANIMAL_CHOPPER = "OP04-010";
  return [
  {
    card: "OP18-001", name: "powers and grants Rush only to Characters with both {Animal} and {Alabasta} (#577)",
    leaders: { me: "OP18-001" },
    me: { field: [KAROO, VIVI, KOMACHIYO] },
    expect: {
      me: {
        power: { [KAROO]: 4000, [VIVI]: 4000, [KOMACHIYO]: 3000 },
        keywords: { [KAROO]: ["rush"], [VIVI]: [], [KOMACHIYO]: [] },
      },
    },
  },

  {
    card: "OP18-060", name: "draws 2 and trashes 1 when a Character is played from your trash (#577)",
    leaders: { me: "OP18-060" },
    me: { hand: [HAMLET], trash: [SPEED], don: { active: 3 } },
    steps: [{ play: HAMLET }, { pick: [SPEED] }, { pick: [FILLER] }],
    expect: { me: { hand: [FILLER], field: [HAMLET, SPEED], trash: [FILLER] } },
  },
  {
    card: "OP18-060", name: "does nothing when the Character is played from the hand (#577)",
    leaders: { me: "OP18-060" },
    me: { hand: [ANIMAL_CHOPPER, KAROO], don: { active: 3 } },
    steps: [{ play: ANIMAL_CHOPPER }, { pick: [KAROO] }],
    expect: { me: { hand: [], field: [ANIMAL_CHOPPER, KAROO], trash: [] }, pending: "none" },
  },

  {
    card: "OP18-076", name: "gives a 5000 power Leader and the chosen Characters +1000 (#577)",
    opp: { stage: "OP18-076", field: [KAROO, VIVI, KOMACHIYO] },
    steps: [{ attack: mine("ST01-001"), at: "leader" }, { accept: true }, { pick: [KAROO, VIVI] }],
    expect: { opp: { power: { "ST01-001": 6000, [KAROO]: 4000, [VIVI]: 5000, [KOMACHIYO]: 3000 } } },
  },
  {
    card: "OP18-076", name: "leaves a Leader above 5000 power alone but still powers the Characters (#577)",
    leaders: { opp: "OP02-001" },
    opp: { stage: "OP18-076", field: [KAROO] },
    steps: [{ attack: mine("ST01-001"), at: "leader" }, { accept: true }, { pick: [KAROO] }],
    expect: { opp: { power: { "OP02-001": 6000, [KAROO]: 4000 } } },
  },

  {
    card: "OP16-079", name: "the Character played from the trash gains Rush, not whatever the effect last touched (#577)",
    leaders: { me: "OP16-079" },
    me: { hand: ["OP16-099"], trash: [KOMACHIYO], don: { active: 7 } },
    steps: [{ play: "OP16-099" }, { accept: true }, { pick: [KOMACHIYO] }],
    expect: { me: { field: [KOMACHIYO], keywords: { [KOMACHIYO]: ["rush"] } } },
  },
  ];
})();

const newCardsOct2026Rows: CardScenario[] = (() : CardScenario[] => {
  const KAROO = "ST01-003";
  const ROBIN = "ST01-008";
  const BRICK_FIST = "OP02-067";
  const JAMBE = "OP02-046";
  const SHAMROCK = "OP18-119";
  const EGGHEAD_LEADER = "OP07-097";
  const DOLL = "EB04-046";
  const KAWAMATSU = "OP01-037";
  const FUNKFREED = "EB01-044";
  return [
  {
    card: "OP18-101", name: "On K.O. adds a CP card from hand to the top of Life face-up when Top is chosen (#612)",
    me: { field: [{ card: "OP18-101", rested: true }], hand: [FUNKFREED, ROBIN], life: [KAROO, "ST01-009"] },
    opp: { field: [SHAMROCK] },
    steps: [{ endTurn: true }, { attack: theirs(SHAMROCK), at: mine("OP18-101") }, { passBattle: true }, { pick: [FUNKFREED] }, { pick: ["Top"] }],
    expect: { me: { hand: [ROBIN], life: [FUNKFREED, KAROO, "ST01-009"], faceUp: [true, false, false], field: [] }, pending: "none" },
  },
  {
    card: "OP18-101", name: "On K.O. adds a CP card from hand to the bottom of Life face-up when Bottom is chosen (#612)",
    me: { field: [{ card: "OP18-101", rested: true }], hand: [FUNKFREED, ROBIN], life: [KAROO, "ST01-009"] },
    opp: { field: [SHAMROCK] },
    steps: [{ endTurn: true }, { attack: theirs(SHAMROCK), at: mine("OP18-101") }, { passBattle: true }, { pick: [FUNKFREED] }, { pick: ["Bottom"] }],
    expect: { me: { hand: [ROBIN], life: [KAROO, "ST01-009", FUNKFREED], faceUp: [false, false, true], field: [] }, pending: "none" },
  },
  {
    card: "OP18-101", name: "On K.O. offers nothing when the hand holds no CP card (#612)",
    me: { field: [{ card: "OP18-101", rested: true }], hand: [ROBIN], life: [KAROO] },
    opp: { field: [SHAMROCK] },
    steps: [{ endTurn: true }, { attack: theirs(SHAMROCK), at: mine("OP18-101") }, { passBattle: true }],
    expect: { me: { hand: [ROBIN], life: [KAROO], field: [] }, pending: "none" },
  },

  {
    card: "OP18-085", name: "grants only the chosen keyword to the chosen [Saint Shamrock] after returning itself",
    me: { field: ["OP18-085", SHAMROCK] },
    steps: [{ activate: mine("OP18-085"), ability: "op18-085#0" }, { pick: [SHAMROCK] }, { pick: ["Gain [Banish]"] }],
    expect: { me: { field: [SHAMROCK], hand: ["OP18-085"], keywords: { [SHAMROCK]: ["banish"] } }, pending: "none" },
  },
  {
    card: "OP18-085", name: "grants the last listed keyword when it is chosen",
    me: { field: ["OP18-085", SHAMROCK] },
    steps: [{ activate: mine("OP18-085"), ability: "op18-085#0" }, { pick: [SHAMROCK] }, { pick: ["Gain [Unblockable]"] }],
    expect: { me: { keywords: { [SHAMROCK]: ["unblockable"] } }, pending: "none" },
  },

  {
    card: "P-118", name: "plays a Character with a [Trigger] that is not an {Egghead}",
    leaders: { me: EGGHEAD_LEADER },
    me: { hand: ["P-118", KAWAMATSU, DOLL, KAROO], don: { active: 6 } },
    steps: [{ play: "P-118" }, { pick: [KAWAMATSU] }],
    expect: { me: { field: ["P-118", KAWAMATSU], hand: [DOLL, KAROO] } },
  },
  {
    card: "P-118", name: "plays an {Egghead} Character without a [Trigger]",
    leaders: { me: EGGHEAD_LEADER },
    me: { hand: ["P-118", KAWAMATSU, DOLL, KAROO], don: { active: 6 } },
    steps: [{ play: "P-118" }, { pick: [DOLL] }],
    expect: { me: { field: ["P-118", DOLL], hand: [KAWAMATSU, KAROO] } },
  },
  {
    card: "P-118", name: "offers nothing when the hand has only a Character that is neither an {Egghead} nor has a [Trigger]",
    leaders: { me: EGGHEAD_LEADER },
    me: { hand: ["P-118", KAROO], don: { active: 6 } },
    steps: [{ play: "P-118" }],
    expect: { me: { field: ["P-118"], hand: [KAROO] }, pending: "none" },
  },

  {
    card: "EB05-061", name: "keeps a Character the opponent K.O.s in battle and adds the top Life card to the hand",
    me: { field: ["EB05-061", { card: KAROO, rested: true }] },
    opp: { field: [ROBIN] },
    steps: [{ endTurn: true }, { attack: theirs(ROBIN), at: mine(KAROO) }, { passBattle: true }, { accept: true }],
    expect: { me: { field: ["EB05-061", KAROO], life: 4, hand: [FILLER] }, pending: "none" },
  },
  {
    card: "EB05-061", name: "keeps a Character the opponent's effect K.O.s and adds the top Life card to the hand",
    me: { field: ["EB05-061", { card: KAROO, rested: true }] },
    opp: { hand: [JAMBE], don: { active: 2 } },
    steps: [{ endTurn: true }, { play: JAMBE }, { pick: [KAROO] }, { accept: true }],
    expect: { me: { field: ["EB05-061", KAROO], life: 4, hand: [FILLER] }, pending: "none" },
  },
  {
    card: "EB05-061", name: "does not replace a removal the player's own effect causes",
    me: { field: ["EB05-061", KAROO], hand: [BRICK_FIST], don: { active: 2 } },
    steps: [{ play: BRICK_FIST }, { pick: [KAROO] }],
    expect: { me: { field: ["EB05-061"], life: 5, hand: [KAROO] }, pending: "none" },
  },

  ];
})();

const simultaneousRemovalRows: CardScenario[] = (() : CardScenario[] => {
  const ARAMAKI = "OP17-059";
  const ALVIDA = "OP03-023";
  const BLUE = "OP03-052";
  const NAMI = "OP17-023";
  const ZORO = "OP17-095";
  const KAROO = "ST01-003";
  const BEGE = "OP11-101";
  const DEMON_FACE = "OP01-056";
  const SUPERNOVA_A = "OP02-043";
  const SUPERNOVA_B = "OP14-008";
  return [
  {
    card: NAMI, name: "one rest saves both Characters K.O.'d at the same time (#594)",
    me: { field: [NAMI, ALVIDA, BLUE] },
    opp: { hand: [ARAMAKI], don: { active: 7 } },
    steps: [{ endTurn: true }, { play: ARAMAKI }, { accept: true }, { pick: ["DON"] }, { pick: [ALVIDA, BLUE] }, { accept: true }],
    expect: { me: { field: [NAMI, ALVIDA, BLUE], rested: [NAMI] }, pending: "none" },
  },
  {
    card: ZORO, name: "places 3 cards once when two Characters would be removed at the same time (#594)",
    me: { field: [ZORO, ALVIDA, BLUE], trash: [KAROO, KAROO, KAROO, KAROO, KAROO, KAROO] },
    opp: { hand: [ARAMAKI], don: { active: 7 } },
    steps: [{ endTurn: true }, { play: ARAMAKI }, { accept: true }, { pick: ["DON"] }, { pick: [ALVIDA, BLUE] }, { accept: true }, { pick: [KAROO, KAROO, KAROO] }],
    expect: { me: { field: [ZORO, ALVIDA, BLUE], trash: [KAROO, KAROO, KAROO] }, pending: "none" },
  },
  ];
})();

const eventTriggerQualifiersRows: CardScenario[] = (() : CardScenario[] => {
  const KAROO = "ST01-003";
  const ROBIN = "ST01-008";
  const BELLAMY = "OP01-076";
  const MUGGY_BALL = "OP09-058";
  const GONER = "EB01-029";
  const GIRL = "P-096";
  const ICE_TIME = "EB04-028";
  const DOBON = "OP02-080";
  const HAMLET = "OP08-090";
  return [
  {
    card: "OP10-042", name: "draws 1 when your {Dressrosa} Character is K.O.'d in battle on the opponent's turn (#524)",
    leaders: { me: "OP10-042" },
    me: { field: [{ card: BELLAMY, rested: true }], deckTop: [KAROO] },
    opp: { field: [ROBIN] },
    steps: [{ endTurn: true }, { attack: theirs(ROBIN), at: mine(BELLAMY) }, { passBattle: true }, { accept: true }],
    expect: { me: { hand: [KAROO], field: [], trash: [BELLAMY] } },
  },
  {
    card: "OP10-042", name: "draws nothing when a Character that is not {Dressrosa} is K.O.'d (#524)",
    leaders: { me: "OP10-042" },
    me: { field: [{ card: KAROO, rested: true }], deckTop: [ROBIN] },
    opp: { field: [ROBIN] },
    steps: [{ endTurn: true }, { attack: theirs(ROBIN), at: mine(KAROO) }, { passBattle: true }],
    expect: { me: { hand: [], field: [], trash: [KAROO] }, pending: "none" },
  },
  {
    card: "OP10-042", name: "still draws 1 when the opponent's effect returns your {Dressrosa} Character to your hand (#524)",
    leaders: { me: "OP10-042" },
    me: { field: [BELLAMY], deckTop: [KAROO] },
    opp: { hand: [MUGGY_BALL], don: { active: 2 } },
    steps: [{ endTurn: true }, { play: MUGGY_BALL }, { pick: [BELLAMY] }, { accept: true }],
    expect: { me: { hand: [BELLAMY, KAROO], field: [] } },
  },

  {
    card: "OP14-045", name: "gains [Rush] when an effect trashes a card from your hand (#524)",
    me: { field: ["OP14-045"], hand: [GIRL, ROBIN], don: { active: 2 }, deckTop: [KAROO] },
    steps: [{ play: GIRL }, { pick: [ROBIN] }],
    expect: { me: { trash: [ROBIN], keywords: { "OP14-045": ["rush"] } } },
  },
  {
    card: "OP14-045", name: "gains [Rush] when the cost of an Event trashes a card from your hand (#524)",
    me: { field: ["OP14-045"], hand: [ICE_TIME, ROBIN], don: { active: 5 } },
    steps: [{ play: ICE_TIME }, { accept: true }],
    expect: { me: { trash: [ICE_TIME, ROBIN], keywords: { "OP14-045": ["rush"] } } },
  },
  {
    card: "OP14-045", name: "does not gain [Rush] when you trash a Character from your hand as a Counter (#524)",
    me: { field: ["OP14-045"], hand: [ROBIN] },
    opp: { field: [KAROO] },
    steps: [{ endTurn: true }, { attack: theirs(KAROO), at: "leader" }, { passBlock: true }, { counterCharacter: ROBIN }],
    expect: { me: { trash: [ROBIN], keywords: { "OP14-045": [] } } },
  },
  {
    card: "OP14-049", name: "does not gain [Rush] when you trash a Character from your hand as a Counter (#524)",
    me: { field: ["OP14-049"], hand: [ROBIN] },
    opp: { field: [KAROO] },
    steps: [{ endTurn: true }, { attack: theirs(KAROO), at: "leader" }, { passBlock: true }, { counterCharacter: ROBIN }],
    expect: { me: { trash: [ROBIN], keywords: { "OP14-049": [] } } },
  },
  {
    card: "OP14-049", name: "gains [Rush] when an effect trashes a card from your hand (#524)",
    me: { field: ["OP14-049"], hand: [GIRL, ROBIN], don: { active: 2 }, deckTop: [KAROO] },
    steps: [{ play: GIRL }, { pick: [ROBIN] }],
    expect: { me: { trash: [ROBIN], keywords: { "OP14-049": ["rush"] } } },
  },

  {
    card: "EB02-023", name: "looks at 3 cards when your effect returns the opponent's Character to their hand (#524)",
    me: { field: ["EB02-023"], hand: [MUGGY_BALL], don: { active: 2 } },
    opp: { field: [ROBIN] },
    steps: [{ play: MUGGY_BALL }, { pick: [ROBIN] }],
    expect: { opp: { hand: [ROBIN], field: [] }, pending: "look" },
  },
  {
    card: "EB02-023", name: "does nothing when the opponent's own effect returns their Character on your turn (#524)",
    me: { field: ["EB02-023", ROBIN] },
    opp: { field: [KAROO], life: [GONER, KAROO] },
    steps: [{ attack: mine(ROBIN), at: "leader" }, { passBattle: true }, { accept: true }, { pick: [KAROO] }],
    expect: { opp: { hand: [KAROO], field: [] }, pending: "none" },
  },

  {
    card: "OP02-026", name: "sets 2 DON!! active when you play a Character with no base effect from your hand (#524)",
    leaders: { me: "OP02-026" },
    me: { hand: [DOBON], don: { active: 2, rested: 1 } },
    steps: [{ play: DOBON }],
    expect: { me: { field: [DOBON], don: { active: 2, rested: 1 } } },
  },
  {
    card: "OP02-026", name: "does nothing when an effect plays a Character with no base effect from your trash (#524)",
    leaders: { me: "OP02-026" },
    me: { hand: [HAMLET], trash: [DOBON], don: { active: 3, rested: 2 } },
    steps: [{ play: HAMLET }, { pick: [DOBON] }],
    expect: { me: { field: [HAMLET, DOBON], don: { active: 0, rested: 5 } } },
  },
  ];
})();

/** Every copied row, tagged with the test file it came from. */
export const SCENARIO_ROWS: { source: string; row: CardScenario }[] = [
  ...leadersAndStaticsRows.map((row) => ({ source: "leadersAndStatics", row })),
  ...effectsRows.map((row) => ({ source: "effects", row })),
  ...removedFromFieldRows.map((row) => ({ source: "removedFromField", row })),
  ...opponentMayPayRows.map((row) => ({ source: "opponentMayPay", row })),
  ...optionalCostsRows.map((row) => ({ source: "optionalCosts", row })),
  ...replacementScopeRows.map((row) => ({ source: "replacementScope", row })),
  ...eb05Rows.map((row) => ({ source: "eb05", row })),
  ...op18Rows.map((row) => ({ source: "op18", row })),
  ...newCardsOct2026Rows.map((row) => ({ source: "newCardsOct2026", row })),
  ...simultaneousRemovalRows.map((row) => ({ source: "simultaneousRemoval", row })),
  ...eventTriggerQualifiersRows.map((row) => ({ source: "eventTriggerQualifiers", row })),
];
