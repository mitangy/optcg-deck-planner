/**
 * Card text compiler fixes (#594): a "Then" after an "If" stays inside the If (Rule 4-10-2); "rest N of your cards" and
 * "N or more rested cards" include the cost area's DON!!; "the only Characters" needs a Character; "[Name] Character" is
 * not the Leader; a base power copy needs a selection; "would be removed from the field" matches any removal; "up to N"
 * Life moves can be declined; Xebec's Counter needs a Character.
 */
import { describe, expect, it } from "vitest";
import { runScenarios, mine, theirs, type CardScenario } from "../../testing/scenario.js";
import { Harness } from "../../testing/harness.js";
import { counterOf } from "../../engine/queries.js";

const KAROO = "ST01-003"; // vanilla 1-cost 3000
const LUFFY_CHAR = "ST01-012"; // vanilla 5-cost 6000
const BIG_CHAR = "OP17-003"; // 4-cost 6000 vanilla-ish body for the opponent's side

const rows: CardScenario[] = [
  // OP14-020 Mihawk: "If there is a Character with a cost of 5 or more, set up to 3 DON!!. Then, you cannot play Character cards."
  {
    card: "OP14-020", name: "with no cost 5+ Character you can still play Characters after activating (#594)",
    leaders: { me: "OP14-020" },
    me: { hand: [KAROO], don: { active: 3 } },
    steps: [{ activate: mine("OP14-020"), ability: "op14-020#1" }, { pick: ["OP14-020"] }, { play: KAROO }],
    expect: { me: { field: [KAROO] }, pending: "none" },
  },
  {
    card: "OP14-020", name: "with a cost 5+ Character you cannot play Characters after activating (#594)",
    leaders: { me: "OP14-020" },
    me: { hand: [KAROO], don: { active: 3, rested: 1 } },
    opp: { field: [LUFFY_CHAR] },
    steps: [{ activate: mine("OP14-020"), ability: "op14-020#1" }, { pick: ["OP14-020"] }, { play: KAROO, rejects: true }],
    expect: { me: { field: [], don: { active: 4 } }, pending: "none" },
  },
  // OP17-034 Rockstar: "If your opponent's Leader has 6000 power or more, set 1 DON!! active. Then, your {Red-Haired Pirates} Leader's base power becomes 6000."
  {
    card: "OP17-034", name: "does not raise the Leader's base power when the opponent's Leader is under 6000 (#594)",
    leaders: { me: "OP09-001" },
    me: { field: ["OP17-034"], don: { active: 0, rested: 1 } },
    steps: [{ activate: mine("OP17-034"), ability: "op17-034#0" }],
    expect: { me: { power: { "OP09-001": 5000 }, don: { active: 0, rested: 1 } }, pending: "none" },
  },
  {
    card: "OP17-034", name: "raises the Leader's base power when the opponent's Leader has 6000 power (#594)",
    leaders: { me: "OP09-001", opp: "OP02-001" },
    me: { field: ["OP17-034"], don: { active: 0, rested: 1 } },
    steps: [{ activate: mine("OP17-034"), ability: "op17-034#0" }],
    expect: { me: { power: { "OP09-001": 6000 }, don: { active: 1, rested: 0 } }, pending: "none" },
  },
  // OP17-038: "You may rest 4 of your cards: Rest up to 1 of your opponent's Characters." DON!! in the cost area counts as a card.
  {
    card: "OP17-038", name: "can be paid with four active DON!! alone (#594)",
    me: { hand: ["OP17-038"], don: { active: 4 } },
    opp: { field: [KAROO] },
    steps: [{ play: "OP17-038" }, { accept: true }, { pick: ["DON", "DON", "DON", "DON"] }, { pick: [KAROO] }],
    expect: { me: { don: { active: 0, rested: 4 } }, opp: { rested: [KAROO] }, pending: "none" },
  },
  // OP15-032 Brook: "Rest up to 1 of your opponent's cards." includes their active DON!!.
  {
    card: "OP15-032", name: "can rest one of the opponent's active DON!! (#594)",
    me: { hand: ["OP15-032"], don: { active: 6 } },
    opp: { don: { active: 2 } },
    steps: [{ play: "OP15-032" }, { pick: ["DON"] }],
    expect: { opp: { don: { active: 1, rested: 1 } }, pending: "none" },
  },
  // OP06-038: "if you have 8 or more rested cards, that card gains an additional +2000 power". Rested cost-area DON!! counts.
  {
    card: "OP06-038", name: "counts rested DON!! toward 8 or more rested cards (#594)",
    me: { hand: ["OP06-038"], don: { active: 1, rested: 7 } },
    steps: [{ endTurn: true }, { attack: theirs("ST01-001"), at: "leader" }, { passBlock: true }, { counter: "OP06-038" }, { pick: ["ST01-001"] }],
    expect: { me: { power: { "ST01-001": 9000 } }, pending: "none" },
  },
  {
    card: "OP06-038", name: "gives only +2000 with 7 rested cards (#594)",
    me: { hand: ["OP06-038"], don: { active: 1, rested: 6 } },
    steps: [{ endTurn: true }, { attack: theirs("ST01-001"), at: "leader" }, { passBlock: true }, { counter: "OP06-038" }, { pick: ["ST01-001"] }],
    expect: { me: { power: { "ST01-001": 7000 } }, pending: "none" },
  },
  // OP16-022 Luffy Leader: "If the only Characters on your field are {Impel Down} type Characters, set up to 2 of your DON!! cards as active."
  {
    card: "OP16-022", name: "with no Characters it does not set DON!! active (#594)",
    leaders: { me: "OP16-022" },
    me: { don: { active: 0, rested: 3 } },
    steps: [{ activate: mine("OP16-022"), ability: "op16-022#0" }],
    expect: { me: { don: { active: 0, rested: 3 } }, pending: "none" },
  },
  {
    card: "OP16-022", name: "with only {Impel Down} Characters it sets 2 DON!! active (#594)",
    leaders: { me: "OP16-022" },
    me: { field: ["OP16-104"], don: { active: 0, rested: 3 } },
    steps: [{ activate: mine("OP16-022"), ability: "op16-022#0" }],
    expect: { me: { don: { active: 2, rested: 1 } }, pending: "none" },
  },
  // OP08-109 Noland: "If your Leader has the {Shandian Warrior} type and you have a [Kalgara] Character, add up to 1 card from the top of your deck to the top of your Life cards."
  {
    card: "OP08-109", name: "a [Kalgara] Leader is not a [Kalgara] Character (#594)",
    leaders: { me: "OP08-098" },
    me: { hand: ["OP08-109"], don: { active: 5 }, life: [KAROO, KAROO] },
    steps: [{ play: "OP08-109" }],
    expect: { me: { life: 2 }, pending: "none" },
  },
  {
    card: "OP08-109", name: "adds a card to Life when a [Kalgara] Character is on the field (#594)",
    leaders: { me: "OP08-098" },
    me: { hand: ["OP08-109"], field: ["OP08-098"], don: { active: 5 }, life: [KAROO, KAROO] },
    steps: [{ play: "OP08-109" }, { accept: true }],
    expect: { me: { life: 3 }, pending: "none" },
  },
  // OP16-104 Catarina Devon: "Select up to 1 of your opponent's Characters. This Character's base power becomes the same as the selected Character's power."
  {
    card: "OP16-104", name: "keeps its base power when no Character was selected (#594)",
    me: { field: ["OP16-104"] },
    steps: [{ attack: mine("OP16-104"), at: "leader" }],
    expect: { me: { power: { "OP16-104": 3000 } } },
  },
  {
    card: "OP16-104", name: "copies the selected Character's power (#594)",
    me: { field: ["OP16-104"] },
    opp: { field: [LUFFY_CHAR] },
    steps: [{ attack: mine("OP16-104"), at: "leader" }, { pick: [LUFFY_CHAR] }],
    expect: { me: { power: { "OP16-104": 6000 } } },
  },
  // OP12-073 Trafalgar Law: "If the number of DON!! on your field is equal to or less than the opponent's, add 1 DON!!. Then, all of your {Heart Pirates} Characters gain +1000 power" (official Q&A: none gain it otherwise).
  {
    card: "OP12-073", name: "gives no +1000 power when you have more DON!! than the opponent (#594)",
    me: { hand: ["OP12-073"], don: { active: 7 } },
    steps: [{ play: "OP12-073" }],
    expect: { me: { power: { "OP12-073": 8000 } }, pending: "none" },
  },
  {
    card: "OP12-073", name: "gives {Heart Pirates} Characters +1000 power when the opponent has as many DON!! (#594)",
    me: { hand: ["OP12-073"], don: { active: 7 } },
    opp: { don: { active: 7 } },
    steps: [{ play: "OP12-073" }],
    expect: { me: { power: { "OP12-073": 9000 } }, pending: "none" },
  },
  // OP17-043 Ganzui: "If this Character would be removed from the field, you may trash 2 cards from your hand instead."
  {
    card: "OP17-043", name: "offers to trash 2 cards when the opponent's effect returns it to the hand (#594)",
    me: { hand: ["OP09-058"], don: { active: 2 } },
    opp: { field: ["OP17-043"], hand: [KAROO, KAROO, BIG_CHAR] },
    steps: [{ play: "OP09-058" }, { pick: ["OP17-043"] }, { accept: true }, { pick: [KAROO, KAROO] }],
    expect: { opp: { field: ["OP17-043"], hand: [BIG_CHAR], trash: [KAROO, KAROO] }, pending: "none" },
  },
  // OP17-103 Katakuri: "add up to 1 card from the top of your deck to the top of your Life cards" can be declined.
  {
    card: "OP17-103", name: "lets you decline adding a card to Life (#594)",
    leaders: { me: "OP03-099" },
    me: { hand: ["OP17-103"], don: { active: 6 }, life: [KAROO, KAROO] },
    steps: [{ play: "OP17-103" }, { decline: true }],
    expect: { me: { life: 2 } },
  },
  {
    card: "OP17-103", name: "adds a card to Life when accepted (#594)",
    leaders: { me: "OP03-099" },
    me: { hand: ["OP17-103"], don: { active: 6 }, life: [KAROO, KAROO] },
    steps: [{ play: "OP17-103" }, { accept: true }],
    expect: { me: { life: 3 } },
  },
  // OP09-107 Nico Robin: "trash up to 1 card from the top of your opponent's Life cards" can be declined.
  {
    card: "OP09-107", name: "lets you decline trashing the opponent's Life card (#594)",
    me: { hand: ["OP09-107"], don: { active: 6 } },
    opp: { life: [KAROO, KAROO, KAROO] },
    steps: [{ play: "OP09-107" }, { decline: true }],
    expect: { opp: { life: 3 } },
  },
  {
    card: "OP09-107", name: "trashes the opponent's top Life card when accepted (#594)",
    me: { hand: ["OP09-107"], don: { active: 6 } },
    opp: { life: [KAROO, KAROO, KAROO] },
    steps: [{ play: "OP09-107" }, { accept: true }],
    expect: { opp: { life: 2 } },
  },
];

runScenarios("Card text compiler fixes (#594)", rows);

describe("OP17-118 Rocks.D.Xebec (#594)", () => {
  it("has no +2000 Counter in hand while you have no Characters (#594)", () => {
    const h = new Harness();
    h.hand(0, "OP17-118");
    expect(counterOf(h.state, 0, h.state.players[0].hand[0]!)).toBe(0);
  });
  it("has a +2000 Counter in hand while all your Characters have no Counter (#594)", () => {
    const h = new Harness();
    h.hand(0, "OP17-118");
    h.field(0, LUFFY_CHAR);
    expect(counterOf(h.state, 0, h.state.players[0].hand[0]!)).toBe(2000);
  });
});

describe("OP15-058 Enel Leader (#594)", () => {
  const activate = (turnsStarted: number) => {
    const h = new Harness({ leaders: ["OP15-058", "ST01-001"] });
    h.field(0, KAROO);
    h.don(0, 1, 2);
    h.state.players[0].turnsStarted = turnsStarted;
    h.act(0, { type: "activate_ability", sourceId: h.find(0, "OP15-058")!.id, abilityId: "op15-058#1" });
    return h;
  };
  it("on the first turn it adds no DON!! and gives none to a Character (#594)", () => {
    const h = activate(1);
    expect(h.state.players[0].costArea.length).toBe(3);
    expect(h.state.players[0].attachedDons.length).toBe(0);
    expect(h.choice).toBeUndefined();
  });
  it("from the second turn it adds DON!! and asks for a Character to give it to (#594)", () => {
    const h = activate(2);
    expect(h.state.players[0].costArea.length).toBeGreaterThan(3);
    expect(h.choice?.request?.type).toBe("select");
  });
});
