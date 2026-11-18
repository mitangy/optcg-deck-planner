import { describe, expect, it } from "vitest";
import { FILLER, Harness } from "../../testing/harness.js";
import { runScenarios, mine, theirs, type CardScenario } from "../../testing/scenario.js";

const KAROO = "ST01-003";
const ROBIN = "ST01-008";
const BRICK_FIST = "OP02-067";
const JAMBE = "OP02-046";
const SHAMROCK = "OP18-119";
const EGGHEAD_LEADER = "OP07-097";
const DOLL = "EB04-046";
const KAWAMATSU = "OP01-037";

const FUNKFREED = "EB01-044";
const rows: CardScenario[] = [
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

runScenarios("new cards (October 2026)", rows);

describe("OP09-056 excludes [Mr.3(Galdino)] by its full name", () => {
  it("offers a Baroque Works card but not Mr.3(Galdino)", () => {
    const h = new Harness({ leaders: ["ST01-001", "ST01-001"] });
    h.don(0, 6, 0);
    h.hand(0, "OP09-056");
    h.deckTop(0, "OP01-085", "OP14-091", KAROO, KAROO);
    h.play(0, "OP09-056");
    const request = h.choice?.request;
    if (request?.type !== "look") throw new Error("expected a look prompt");
    expect(request.options.map((o) => [o.defId, o.eligible])).toEqual([["OP01-085", false], ["OP14-091", true], [KAROO, false], [KAROO, false]]);
  });
});
